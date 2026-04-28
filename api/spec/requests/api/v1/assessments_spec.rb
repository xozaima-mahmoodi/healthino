require "rails_helper"

RSpec.describe "GET /api/v1/assessments" do
  let(:patient) { create(:user, name: "Patient One") }
  let(:other_patient) { create(:user, name: "Patient Two") }
  let(:doctor) { create(:user, name: "Dr. Karimi", is_doctor: true) }

  def auth_headers_for(user)
    {
      "Accept" => "application/json",
      "Authorization" => "Bearer #{user.api_token}"
    }
  end

  context "when no Authorization header is provided" do
    it "returns 401" do
      get "/api/v1/assessments"
      expect(response).to have_http_status(:unauthorized)
      body = JSON.parse(response.body)
      expect(body["error"]).to eq("unauthorized")
    end
  end

  context "when the bearer token is unknown" do
    it "returns 401" do
      get "/api/v1/assessments",
          headers: { "Authorization" => "Bearer this-token-does-not-exist" }
      expect(response).to have_http_status(:unauthorized)
    end
  end

  context "when the Authorization scheme is not Bearer" do
    it "returns 401" do
      get "/api/v1/assessments",
          headers: { "Authorization" => "Basic #{Base64.strict_encode64('a:b')}" }
      expect(response).to have_http_status(:unauthorized)
    end
  end

  context "when an authenticated patient requests their own history" do
    before do
      create(:assessment, user: patient, primary_symptom: "headache", intensity: 4, created_at: 2.days.ago)
      create(:assessment, user: patient, primary_symptom: "fever",    intensity: 7, created_at: 1.hour.ago)
      create(:assessment, user: other_patient, primary_symptom: "cough", intensity: 3)
    end

    it "returns 200 with only their own assessments, ordered most-recent first" do
      get "/api/v1/assessments", headers: auth_headers_for(patient)

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)

      expect(body["patient"]).to include("id" => patient.id, "name" => patient.name)
      expect(body["viewing_as"]).to eq("self")
      expect(body["assessments"].length).to eq(2)
      expect(body["assessments"].map { |a| a["primary_symptom"] }).to eq(%w[fever headache])
      expect(body["assessments"].first).to include(
        "primary_symptom" => "fever",
        "intensity" => 7,
        "body_area" => "head"
      )
      expect(body["assessments"].first["result"]).to be_a(Hash)
    end

    it "does NOT leak any other user's assessments" do
      get "/api/v1/assessments", headers: auth_headers_for(patient)
      body = JSON.parse(response.body)
      expect(body["assessments"].map { |a| a["primary_symptom"] }).not_to include("cough")
    end
  end

  context "when a non-doctor patient passes ?user_id= for someone else" do
    before do
      create(:assessment, user: other_patient, primary_symptom: "cough")
    end

    it "returns 403 forbidden and does NOT return the other user's data" do
      get "/api/v1/assessments",
          params: { user_id: other_patient.id },
          headers: auth_headers_for(patient)

      expect(response).to have_http_status(:forbidden)
      body = JSON.parse(response.body)
      expect(body["error"]).to eq("forbidden")
      expect(body).not_to have_key("assessments")
    end

    it "still works (200) when the patient passes their OWN id explicitly" do
      get "/api/v1/assessments",
          params: { user_id: patient.id },
          headers: auth_headers_for(patient)

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["viewing_as"]).to eq("self")
    end
  end

  context "when a doctor requests another patient's history" do
    before do
      create(:assessment, user: other_patient, primary_symptom: "cough",   intensity: 3, created_at: 2.days.ago)
      create(:assessment, user: other_patient, primary_symptom: "dizziness", intensity: 6, created_at: 1.hour.ago)
    end

    it "returns 200 with that patient's history and viewing_as=doctor" do
      get "/api/v1/assessments",
          params: { user_id: other_patient.id },
          headers: auth_headers_for(doctor)

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["patient"]).to include("id" => other_patient.id, "name" => other_patient.name)
      expect(body["viewing_as"]).to eq("doctor")
      expect(body["assessments"].map { |a| a["primary_symptom"] }).to eq(%w[dizziness cough])
    end

    it "returns 404 when the requested patient does not exist" do
      get "/api/v1/assessments",
          params: { user_id: 999_999 },
          headers: auth_headers_for(doctor)

      expect(response).to have_http_status(:not_found)
    end

    it "returns the doctor's own (empty) history when no user_id is given" do
      get "/api/v1/assessments", headers: auth_headers_for(doctor)

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["patient"]["id"]).to eq(doctor.id)
      expect(body["viewing_as"]).to eq("self")
      expect(body["assessments"]).to eq([])
    end
  end
end
