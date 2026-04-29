require "rails_helper"

RSpec.describe "Auth API" do
  let(:json_headers) { { "Content-Type" => "application/json", "Accept" => "application/json" } }

  describe "POST /api/v1/auth/register" do
    let(:valid_params) do
      {
        name: "Sara K",
        email: "sara@example.com",
        password: "secret123",
        preferred_locale: "fa"
      }
    end

    it "creates a user and returns a token + user payload" do
      expect {
        post "/api/v1/auth/register", params: valid_params.to_json, headers: json_headers
      }.to change(User, :count).by(1)

      expect(response).to have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body["token"]).to be_a(String).and have_attributes(length: 48)
      expect(body["user"]).to include(
        "name" => "Sara K",
        "email" => "sara@example.com",
        "preferred_locale" => "fa",
        "is_doctor" => false
      )
    end

    it "returns 422 when email is already taken" do
      create(:user, email: "sara@example.com")
      post "/api/v1/auth/register", params: valid_params.to_json, headers: json_headers
      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)["errors"]).to have_key("email")
    end

    it "returns 422 when password is shorter than 6 chars" do
      post "/api/v1/auth/register",
           params: valid_params.merge(password: "abc").to_json,
           headers: json_headers
      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)["errors"]).to have_key("password")
    end

    it "returns 422 when email is malformed" do
      post "/api/v1/auth/register",
           params: valid_params.merge(email: "not-an-email").to_json,
           headers: json_headers
      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)["errors"]).to have_key("email")
    end

    it "accepts an email surrounded by invisible bidi/IME chars (LRM, RLM, NBSP, ZWSP)" do
      noisy_email = "‎ khazimeh@gmail.com‏​"
      post "/api/v1/auth/register",
           params: valid_params.merge(email: noisy_email, name: "خزیمه محمودی").to_json,
           headers: json_headers

      expect(response).to have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body["user"]["email"]).to eq("khazimeh@gmail.com")
      expect(body["user"]["name"]).to eq("خزیمه محمودی")
      expect(body["user"]["display_name"]).to eq("خزیمه محمودی")
      expect(body["token"]).to be_present
    end
  end

  describe "POST /api/v1/auth/login" do
    let!(:user) { create(:user, email: "ali@example.com", password: "secret123") }

    it "returns 200 with the user's existing api_token on valid credentials" do
      post "/api/v1/auth/login",
           params: { email: "ali@example.com", password: "secret123" }.to_json,
           headers: json_headers
      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["token"]).to eq(user.api_token)
      expect(body["user"]["id"]).to eq(user.id)
    end

    it "is case-insensitive on email" do
      post "/api/v1/auth/login",
           params: { email: "ALI@EXAMPLE.COM", password: "secret123" }.to_json,
           headers: json_headers
      expect(response).to have_http_status(:ok)
    end

    it "returns 401 on wrong password" do
      post "/api/v1/auth/login",
           params: { email: "ali@example.com", password: "wrong" }.to_json,
           headers: json_headers
      expect(response).to have_http_status(:unauthorized)
      expect(JSON.parse(response.body)["errors"]["base"]).to include("invalid_credentials")
    end

    it "returns 401 for an unknown email" do
      post "/api/v1/auth/login",
           params: { email: "ghost@example.com", password: "anything" }.to_json,
           headers: json_headers
      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "GET /api/v1/me" do
    let(:user) { create(:user) }

    it "returns 401 without a token" do
      get "/api/v1/me"
      expect(response).to have_http_status(:unauthorized)
    end

    it "returns the current user when authenticated" do
      get "/api/v1/me", headers: { "Authorization" => "Bearer #{user.api_token}" }
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["user"]).to include("id" => user.id, "email" => user.email)
    end
  end

  describe "end-to-end: register → empty history → submit → history has 1 entry" do
    let!(:general) { create(:specialty, :general) }
    let!(:emergency) { create(:specialty, :emergency) }
    let!(:neurology) { create(:specialty, :neurology) }
    let!(:neuro_doc) { create(:doctor, specialty: neurology, rating: 4.7) }

    it "shows an empty history right after sign-up, then a populated one after a triage submission" do
      post "/api/v1/auth/register",
           params: { name: "Maya", email: "maya@example.com", password: "secret123" }.to_json,
           headers: json_headers
      expect(response).to have_http_status(:created)
      token = JSON.parse(response.body)["token"]
      auth = { "Authorization" => "Bearer #{token}" }

      get "/api/v1/assessments", headers: auth
      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["assessments"]).to eq([])
      expect(body["viewing_as"]).to eq("self")

      post "/api/v1/symptom_checker",
           params: { symptoms: ["headache"], severity: 4, body_area: "head", duration_hours: 6, locale: "fa" }.to_json,
           headers: json_headers.merge(auth)
      expect(response).to have_http_status(:ok)

      get "/api/v1/assessments", headers: auth
      body = JSON.parse(response.body)
      expect(body["assessments"].length).to eq(1)
      expect(body["assessments"].first).to include(
        "primary_symptom" => "headache",
        "body_area" => "head",
        "intensity" => 4,
        "duration_hours" => 6
      )
      expect(body["assessments"].first["result"]).to include("specialty")
    end
  end
end
