require "rails_helper"

# Covers the error contract of POST /api/v1/assessments/analyze_document.
#
# Written after the 2026-07-29 incident, where a network intermediary blocked
# every request to openrouter.ai and the endpoint answered a bare 502 with no
# machine-readable code. The guarantee asserted here: whatever fails upstream,
# the client always receives well-formed JSON carrying a stable `code`, friendly
# human copy, and an explicit `retryable` flag — never an unhandled exception.
RSpec.describe "POST /api/v1/assessments/analyze_document" do
  let(:patient) { create(:user, name: "Patient One") }

  def auth_headers
    { "Accept" => "application/json", "Authorization" => "Bearer #{patient.api_token}" }
  end

  def png_upload
    Rack::Test::UploadedFile.new(
      StringIO.new("fake-png-bytes"), "image/png", original_filename: "lab.png"
    )
  end

  def post_analyze(file: png_upload, locale: "fa")
    post "/api/v1/assessments/analyze_document",
         params: { file: file, locale: locale },
         headers: auth_headers
  end

  def body
    JSON.parse(response.body)
  end

  it "requires authentication" do
    post "/api/v1/assessments/analyze_document", params: { locale: "fa" }
    expect(response).to have_http_status(:unauthorized)
  end

  context "on success" do
    it "returns all four contract keys" do
      allow_any_instance_of(OpenRouterService).to receive(:analyze_document).and_return(
        "summary" => "Findings.",
        "questions" => %w[a b c],
        "vital_badges" => [{ "label" => "Hgb", "value" => "10.2", "status" => "warning", "icon" => "🩸" }],
        "medical_terms" => [{ "term" => "Anemia", "definition" => "Low red blood cells." }]
      )

      post_analyze
      expect(response).to have_http_status(:ok)
      expect(body.keys).to contain_exactly("summary", "questions", "vital_badges", "medical_terms")
      expect(body["vital_badges"].first["status"]).to eq("warning")
    end
  end

  context "when the request is blocked before reaching OpenRouter" do
    before do
      allow_any_instance_of(OpenRouterService).to receive(:analyze_document)
        .and_raise(OpenRouterService::UpstreamBlockedError, "openrouter_blocked_upstream (HTTP 403 ...)")
    end

    it "returns a retryable 503 with the upstream_blocked code, not a 502" do
      post_analyze

      expect(response).to have_http_status(:service_unavailable)
      expect(response).not_to have_http_status(:bad_gateway)
      expect(body["error"]).to eq("upstream_blocked")
      expect(body["retryable"]).to be(true)
      expect(response.headers["Retry-After"]).to eq("30")
    end

    it "includes friendly human-readable copy for the patient" do
      post_analyze

      expect(body["message"]).to be_present
      # Real copy, not a machine code echoed back at the user.
      expect(body["message"]).not_to eq(body["error"])
      expect(body["message"]).to match(/\p{Arabic}/)
    end

    it "returns parseable JSON rather than an HTML error page" do
      post_analyze

      expect(response.media_type).to eq("application/json")
      expect { JSON.parse(response.body) }.not_to raise_error
    end
  end

  context "when every candidate model fails" do
    it "returns a retryable 503 with the upstream_unavailable code" do
      allow_any_instance_of(OpenRouterService).to receive(:analyze_document)
        .and_raise(OpenRouterService::ApiError, "openrouter_all_models_failed (...)")

      post_analyze
      expect(response).to have_http_status(:service_unavailable)
      expect(body["error"]).to eq("upstream_unavailable")
      expect(body["retryable"]).to be(true)
    end
  end

  context "when the service is misconfigured" do
    it "returns a NON-retryable 503, since retrying cannot fix an operator error" do
      allow_any_instance_of(OpenRouterService).to receive(:analyze_document)
        .and_raise(OpenRouterService::ConfigurationError, "OPENROUTER_API_KEY is not configured")

      post_analyze
      expect(response).to have_http_status(:service_unavailable)
      expect(body["error"]).to eq("service_unconfigured")
      expect(body["retryable"]).to be(false)
      expect(response.headers["Retry-After"]).to be_nil
    end
  end

  context "on an unexpected internal error" do
    it "still answers structured JSON instead of a 500" do
      allow_any_instance_of(OpenRouterService).to receive(:analyze_document)
        .and_raise(NoMethodError, "undefined method `dig' for nil")

      post_analyze
      expect(response).to have_http_status(:service_unavailable)
      expect(body["error"]).to eq("analysis_failed")
      expect(body["message"]).to be_present
    end
  end

  context "on bad input" do
    it "returns 422 when no file is attached" do
      post "/api/v1/assessments/analyze_document",
           params: { locale: "fa" }, headers: auth_headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(body["error"]).to eq("file_required")
      # Same shape as every other failure path — one contract for the client.
      expect(body["message"]).to be_present
      expect(body["retryable"]).to be(false)
    end

    it "returns a non-retryable 422 for an unsupported MIME type" do
      post_analyze(
        file: Rack::Test::UploadedFile.new(
          StringIO.new("plain text"), "text/plain", original_filename: "notes.txt"
        )
      )

      expect(response).to have_http_status(:unprocessable_content)
      expect(body["error"]).to match(/unsupported_mime_type/)
      expect(body["retryable"]).to be(false)
    end
  end

  context "detail leakage" do
    before do
      allow_any_instance_of(OpenRouterService).to receive(:analyze_document)
        .and_raise(OpenRouterService::UpstreamBlockedError, "internal-upstream-reason")
    end

    it "exposes the internal reason outside production, to aid debugging" do
      post_analyze
      expect(body["detail"]).to include("internal-upstream-reason")
    end

    it "withholds the internal reason in production" do
      allow(Rails.env).to receive(:production?).and_return(true)

      post_analyze
      expect(body).not_to have_key("detail")
      expect(body["error"]).to eq("upstream_blocked")
      expect(body["message"]).to be_present
    end
  end
end
