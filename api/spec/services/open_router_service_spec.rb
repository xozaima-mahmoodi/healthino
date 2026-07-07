require "rails_helper"

RSpec.describe OpenRouterService do
  let(:api_key)  { "test-key-123" }
  let(:base_url) { "https://openrouter.test/api/v1" }

  subject(:service) { described_class.new(api_key: api_key, base_url: base_url) }

  # A minimal stand-in for an uploaded file: responds to the read/rewind/
  # content_type trio the service relies on, without touching disk.
  def fake_file(content: "raw-document-bytes", content_type: "image/png")
    StringIO.new(content).tap do |io|
      io.define_singleton_method(:content_type) { content_type }
    end
  end

  # Wires the service's Faraday connection to the test adapter so we assert on
  # the outgoing request and feed canned responses, with the real json request/
  # response middleware in place (so body serialization + parsing are exercised).
  def stub_openrouter(&block)
    stubs = Faraday::Adapter::Test::Stubs.new
    conn = Faraday.new(url: "#{base_url}/") do |f|
      f.request :json
      f.response :json, content_type: /\bjson/
      f.adapter :test, stubs
    end
    allow_any_instance_of(described_class).to receive(:connection).and_return(conn)
    block.call(stubs)
    stubs
  end

  # OpenAI/OpenRouter-shaped success body: the JSON contract lives in
  # choices[0].message.content as a string.
  def ok_body(summary: "Findings summary", questions: ["q1", "q2", "q3"])
    JSON.generate(
      "choices" => [
        { "message" => { "role" => "assistant", "content" => JSON.generate("summary" => summary, "questions" => questions) } }
      ]
    )
  end

  describe "#initialize" do
    it "raises ConfigurationError when the API key is missing" do
      expect { described_class.new(api_key: "", base_url: base_url) }
        .to raise_error(OpenRouterService::ConfigurationError, /OPENROUTER_API_KEY/)
    end

    it "defaults the base URL to OpenRouter when none is provided" do
      expect { described_class.new(api_key: api_key, base_url: nil) }.not_to raise_error
    end
  end

  describe "AI_STUB offline switch" do
    around do |example|
      original = ENV["AI_STUB"]
      ENV["AI_STUB"] = "1"
      example.run
      ENV["AI_STUB"] = original
    end

    it "boots without a base URL or API key" do
      expect { described_class.new(api_key: "", base_url: "") }.not_to raise_error
    end

    it "returns canned localized data without making any request" do
      # No stub_openrouter: a real connection attempt would raise, proving none happens.
      result = described_class.new(api_key: "", base_url: "").analyze_document(fake_file, locale: "ckb")
      expect(result["summary"]).to be_present
      expect(result["questions"].length).to eq(3)
      expect(result).to eq(described_class.const_get(:STUB_ANALYSIS)["ckb"])
    end
  end

  describe "#analyze_document request shape" do
    it "POSTs to chat/completions with Bearer auth, attribution headers and the document part" do
      captured = {}
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do |env|
          captured[:path]    = env.url.path
          captured[:host]    = env.url.host
          captured[:headers] = env.request_headers
          captured[:body]    = JSON.parse(env.request_body)
          [200, { "Content-Type" => "application/json" }, ok_body]
        end
      end

      service.analyze_document(fake_file, locale: "en")

      expect(captured[:host]).to eq("openrouter.test")
      expect(captured[:path]).to eq("/api/v1/chat/completions")
      expect(captured[:headers]["Authorization"]).to eq("Bearer #{api_key}")
      expect(captured[:headers]["HTTP-Referer"]).to eq("https://healthino.app")
      expect(captured[:headers]["X-Title"]).to eq("Healthino AI")

      expect(captured[:body]["model"]).to eq("anthropic/claude-3.5-sonnet")
      expect(captured[:body]["response_format"]).to eq("type" => "json_object")

      messages = captured[:body]["messages"]
      expect(messages.first["role"]).to eq("system")
      expect(messages.first["content"]).to include("medical assistant")

      user_parts = messages.last["content"]
      image_part = user_parts.find { |p| p["type"] == "image_url" }
      data_url = image_part.dig("image_url", "url")
      expect(data_url).to start_with("data:image/png;base64,")
      encoded = data_url.split(",", 2).last
      expect(Base64.strict_decode64(encoded)).to eq("raw-document-bytes")
    end

    it "attaches PDFs as a file part with a base64 data URL" do
      captured = {}
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do |env|
          captured[:body] = JSON.parse(env.request_body)
          [200, { "Content-Type" => "application/json" }, ok_body]
        end
      end

      service.analyze_document(fake_file(content_type: "application/pdf"), locale: "en")

      file_part = captured[:body]["messages"].last["content"].find { |p| p["type"] == "file" }
      expect(file_part.dig("file", "file_data")).to start_with("data:application/pdf;base64,")
    end

    it "asks the model to answer in the requested locale's language" do
      captured = {}
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do |env|
          captured[:system] = JSON.parse(env.request_body).dig("messages", 0, "content")
          [200, { "Content-Type" => "application/json" }, ok_body]
        end
      end

      service.analyze_document(fake_file, locale: "ckb")
      expect(captured[:system]).to include("Central Kurdish (Sorani)")
    end

    it "falls back to the default (Persian) locale for unsupported values" do
      captured = {}
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do |env|
          captured[:system] = JSON.parse(env.request_body).dig("messages", 0, "content")
          [200, { "Content-Type" => "application/json" }, ok_body]
        end
      end

      service.analyze_document(fake_file, locale: "de")
      expect(captured[:system]).to include("Persian (Farsi)")
    end
  end

  describe "#analyze_document response parsing" do
    it "returns the normalized summary and questions" do
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do
          [200, { "Content-Type" => "application/json" }, ok_body(summary: "Iron deficiency", questions: ["a", "b", "c"])]
        end
      end

      result = service.analyze_document(fake_file, locale: "en")
      expect(result).to eq("summary" => "Iron deficiency", "questions" => ["a", "b", "c"])
    end

    it "tolerates markdown fences around the JSON" do
      fenced = JSON.generate(
        "choices" => [
          { "message" => { "content" => "```json\n{\"summary\":\"S\",\"questions\":[\"x\"]}\n```" } }
        ]
      )
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do
          [200, { "Content-Type" => "application/json" }, fenced]
        end
      end

      result = service.analyze_document(fake_file, locale: "en")
      expect(result["summary"]).to eq("S")
      expect(result["questions"]).to eq(["x"])
    end

    it "surfaces raw text as the summary when the model ignores the JSON contract" do
      raw = JSON.generate(
        "choices" => [{ "message" => { "content" => "not json at all" } }]
      )
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do
          [200, { "Content-Type" => "application/json" }, raw]
        end
      end

      result = service.analyze_document(fake_file, locale: "en")
      expect(result["summary"]).to eq("not json at all")
      expect(result["questions"]).to eq([])
    end
  end

  describe "#analyze_document error handling" do
    it "raises ApiError on a non-2xx response" do
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do
          [500, { "Content-Type" => "application/json" }, JSON.generate("error" => { "message" => "boom" })]
        end
      end

      expect { service.analyze_document(fake_file, locale: "en") }
        .to raise_error(OpenRouterService::ApiError, /HTTP 500/)
    end

    it "raises ApiError on a network timeout" do
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") { raise Faraday::TimeoutError }
      end

      expect { service.analyze_document(fake_file, locale: "en") }
        .to raise_error(OpenRouterService::ApiError, /timeout/)
    end

    it "raises ApiError when the endpoint is unreachable" do
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") { raise Faraday::ConnectionFailed, "refused" }
      end

      expect { service.analyze_document(fake_file, locale: "en") }
        .to raise_error(OpenRouterService::ApiError, /unreachable/)
    end

    it "rejects a blank file before making any request" do
      expect { service.analyze_document(nil, locale: "en") }
        .to raise_error(ArgumentError, /file is required/)
    end

    it "rejects an unsupported MIME type" do
      expect { service.analyze_document(fake_file(content_type: "text/plain"), locale: "en") }
        .to raise_error(ArgumentError, /unsupported_mime_type/)
    end
  end
end
