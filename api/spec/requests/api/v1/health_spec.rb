require "rails_helper"

RSpec.describe "GET /api/v1/ping" do
  it "responds 200 with a status payload, no auth required" do
    get "/api/v1/ping"
    expect(response).to have_http_status(:ok)

    body = JSON.parse(response.body)
    expect(body["status"]).to eq("ok")
    expect(body["time"]).to be_a(String)
  end

  it "ignores any Authorization header (does not require a token)" do
    get "/api/v1/ping", headers: { "Authorization" => "Bearer not-a-real-token" }
    expect(response).to have_http_status(:ok)
  end
end
