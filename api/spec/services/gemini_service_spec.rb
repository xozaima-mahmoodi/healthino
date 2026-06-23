require "rails_helper"

RSpec.describe GeminiService do
  let(:api_key)   { "test-key-123" }
  let(:proxy_url) { "https://proxy.test" }

  subject(:service) { described_class.new(api_key: api_key, proxy_url: proxy_url) }

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
  def stub_gemini(&block)
    stubs = Faraday::Adapter::Test::Stubs.new
    conn = Faraday.new(url: "#{proxy_url}/") do |f|
      f.request :json
      f.response :json, content_type: /\bjson/
      f.adapter :test, stubs
    end
    allow_any_instance_of(described_class).to receive(:connection).and_return(conn)
    block.call(stubs)
    stubs
  end

  def ok_body(summary: "Findings summary", questions: ["q1", "q2", "q3"])
    JSON.generate(
      "candidates" => [
        { "content" => { "parts" => [{ "text" => JSON.generate("summary" => summary, "questions" => questions) }] } }
      ]
    )
  end

  describe "#initialize" do
    it "raises ConfigurationError when the proxy URL is missing" do
      expect { described_class.new(api_key: api_key, proxy_url: "") }
        .to raise_error(GeminiService::ConfigurationError, /GEMINI_PROXY_URL/)
    end

    it "raises ConfigurationError when the API key is missing" do
      expect { described_class.new(api_key: "", proxy_url: proxy_url) }
        .to raise_error(GeminiService::ConfigurationError, /GEMINI_API_KEY/)
    end
  end

  describe "GEMINI_STUB offline switch" do
    around do |example|
      original = ENV["GEMINI_STUB"]
      ENV["GEMINI_STUB"] = "1"
      example.run
      ENV["GEMINI_STUB"] = original
    end

    it "boots without a proxy URL or API key" do
      expect { described_class.new(api_key: "", proxy_url: "") }.not_to raise_error
    end

    it "returns canned localized data without making any request" do
      # No stub_gemini: a real connection attempt would raise, proving none happens.
      result = described_class.new(api_key: "", proxy_url: "").analyze_document(fake_file, locale: "ckb")
      expect(result["summary"]).to be_present
      expect(result["questions"].length).to eq(3)
      expect(result).to eq(described_class.const_get(:STUB_ANALYSIS)["ckb"])
    end
  end

  describe "#analyze_document request shape" do
    it "POSTs to the proxied generateContent endpoint with the key header and inline document" do
      captured = {}
      stub_gemini do |stubs|
        stubs.post("v1beta/models/gemini-1.5-flash:generateContent") do |env|
          captured[:path]    = env.url.path
          captured[:host]    = env.url.host
          captured[:headers] = env.request_headers
          captured[:body]    = JSON.parse(env.request_body)
          [200, { "Content-Type" => "application/json" }, ok_body]
        end
      end

      service.analyze_document(fake_file, locale: "en")

      expect(captured[:host]).to eq("proxy.test")
      expect(captured[:path]).to eq("/v1beta/models/gemini-1.5-flash:generateContent")
      expect(captured[:headers]["x-goog-api-key"]).to eq(api_key)

      parts = captured[:body].dig("contents", 0, "parts")
      expect(parts.first["text"]).to include("medical assistant")
      inline = parts.last["inline_data"]
      expect(inline["mime_type"]).to eq("image/png")
      expect(Base64.strict_decode64(inline["data"])).to eq("raw-document-bytes")
      expect(captured[:body].dig("generationConfig", "responseMimeType")).to eq("application/json")
    end

    it "asks Gemini to answer in the requested locale's language" do
      captured = {}
      stub_gemini do |stubs|
        stubs.post("v1beta/models/gemini-1.5-flash:generateContent") do |env|
          captured[:prompt] = JSON.parse(env.request_body).dig("contents", 0, "parts", 0, "text")
          [200, { "Content-Type" => "application/json" }, ok_body]
        end
      end

      service.analyze_document(fake_file, locale: "ckb")
      expect(captured[:prompt]).to include("Central Kurdish (Sorani)")
    end

    it "falls back to the default (Persian) locale for unsupported values" do
      captured = {}
      stub_gemini do |stubs|
        stubs.post("v1beta/models/gemini-1.5-flash:generateContent") do |env|
          captured[:prompt] = JSON.parse(env.request_body).dig("contents", 0, "parts", 0, "text")
          [200, { "Content-Type" => "application/json" }, ok_body]
        end
      end

      service.analyze_document(fake_file, locale: "de")
      expect(captured[:prompt]).to include("Persian (Farsi)")
    end
  end

  describe "#analyze_document response parsing" do
    it "returns the normalized summary and questions" do
      stub_gemini do |stubs|
        stubs.post("v1beta/models/gemini-1.5-flash:generateContent") do
          [200, { "Content-Type" => "application/json" }, ok_body(summary: "Iron deficiency", questions: ["a", "b", "c"])]
        end
      end

      result = service.analyze_document(fake_file, locale: "en")
      expect(result).to eq("summary" => "Iron deficiency", "questions" => ["a", "b", "c"])
    end

    it "tolerates markdown fences around the JSON" do
      fenced = JSON.generate(
        "candidates" => [
          { "content" => { "parts" => [{ "text" => "```json\n{\"summary\":\"S\",\"questions\":[\"x\"]}\n```" }] } }
        ]
      )
      stub_gemini do |stubs|
        stubs.post("v1beta/models/gemini-1.5-flash:generateContent") do
          [200, { "Content-Type" => "application/json" }, fenced]
        end
      end

      result = service.analyze_document(fake_file, locale: "en")
      expect(result["summary"]).to eq("S")
      expect(result["questions"]).to eq(["x"])
    end

    it "surfaces raw text as the summary when the model ignores the JSON contract" do
      raw = JSON.generate(
        "candidates" => [{ "content" => { "parts" => [{ "text" => "not json at all" }] } }]
      )
      stub_gemini do |stubs|
        stubs.post("v1beta/models/gemini-1.5-flash:generateContent") do
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
      stub_gemini do |stubs|
        stubs.post("v1beta/models/gemini-1.5-flash:generateContent") do
          [500, { "Content-Type" => "application/json" }, JSON.generate("error" => { "message" => "boom" })]
        end
      end

      expect { service.analyze_document(fake_file, locale: "en") }
        .to raise_error(GeminiService::ApiError, /HTTP 500/)
    end

    it "raises ApiError on a network timeout" do
      stub_gemini do |stubs|
        stubs.post("v1beta/models/gemini-1.5-flash:generateContent") { raise Faraday::TimeoutError }
      end

      expect { service.analyze_document(fake_file, locale: "en") }
        .to raise_error(GeminiService::ApiError, /timeout/)
    end

    it "raises ApiError when the proxy is unreachable" do
      stub_gemini do |stubs|
        stubs.post("v1beta/models/gemini-1.5-flash:generateContent") { raise Faraday::ConnectionFailed, "refused" }
      end

      expect { service.analyze_document(fake_file, locale: "en") }
        .to raise_error(GeminiService::ApiError, /unreachable/)
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
