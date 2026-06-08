require "rails_helper"

RSpec.describe "PUT /api/v1/profile/update_password" do
  let(:current_password) { "secret123" }
  let(:user) { create(:user, password: current_password) }

  def auth_headers_for(u)
    {
      "Accept" => "application/json",
      "Authorization" => "Bearer #{u.api_token}"
    }
  end

  def change_password(params)
    put "/api/v1/profile/update_password", params: params, headers: auth_headers_for(user)
  end

  context "when no Authorization header is provided" do
    it "returns 401" do
      put "/api/v1/profile/update_password",
          params: { current_password: current_password, password: "NewStrong1!", password_confirmation: "NewStrong1!" }
      expect(response).to have_http_status(:unauthorized)
    end
  end

  context "when the current password is correct and the new password is strong" do
    it "updates the digest, keeps the session token, and returns a success message" do
      original_token = user.api_token

      change_password(
        current_password: current_password,
        password: "NewStrong1!",
        password_confirmation: "NewStrong1!"
      )

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["message"]).to eq("password_updated")

      user.reload
      expect(user.authenticate("NewStrong1!")).to be_truthy
      expect(user.authenticate(current_password)).to be_falsey
      expect(user.api_token).to eq(original_token) # session stays valid
    end
  end

  context "when the current password is wrong" do
    it "returns 401 and leaves the password unchanged" do
      change_password(
        current_password: "not-my-password",
        password: "NewStrong1!",
        password_confirmation: "NewStrong1!"
      )

      expect(response).to have_http_status(:unauthorized)
      body = JSON.parse(response.body)
      expect(body.dig("errors", "current_password")).to be_present

      expect(user.reload.authenticate(current_password)).to be_truthy
    end
  end

  context "when the confirmation does not match" do
    it "returns 422" do
      change_password(
        current_password: current_password,
        password: "NewStrong1!",
        password_confirmation: "Different1!"
      )

      expect(response).to have_http_status(:unprocessable_content)
      body = JSON.parse(response.body)
      expect(body.dig("errors", "password_confirmation")).to be_present
      expect(user.reload.authenticate(current_password)).to be_truthy
    end
  end

  context "when the new password is too weak" do
    it "rejects a password missing a number or special character with 422" do
      change_password(
        current_password: current_password,
        password: "onlyletters",
        password_confirmation: "onlyletters"
      )

      expect(response).to have_http_status(:unprocessable_content)
      body = JSON.parse(response.body)
      expect(body.dig("errors", "password")).to be_present
      expect(user.reload.authenticate(current_password)).to be_truthy
    end

    it "rejects a password shorter than 8 characters with 422" do
      change_password(
        current_password: current_password,
        password: "Ab1!",
        password_confirmation: "Ab1!"
      )

      expect(response).to have_http_status(:unprocessable_content)
      expect(user.reload.authenticate(current_password)).to be_truthy
    end
  end
end
