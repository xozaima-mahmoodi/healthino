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

      expect(captured[:body]["model"]).to eq("google/gemini-2.5-flash")
      expect(captured[:body]["response_format"]).to eq("type" => "json_object")
      # Bounded so the free/low-credit tier's affordability check passes; without
      # it OpenRouter reserves the model's full (65535-token) max output. Raised
      # from 2000 once the contract grew vital_badges + medical_terms: Persian and
      # Sorani cost several tokens per character, and 2000 truncated the JSON
      # mid-object.
      expect(captured[:body]["max_tokens"]).to eq(4000)

      messages = captured[:body]["messages"]
      expect(messages.first["role"]).to eq("system")
      expect(messages.first["content"]).to include("medical assistant")

      user_parts = messages.last["content"]
      # The user turn reinforces JSON-only + the target language (locale "en"
      # here), so weak models that under-weight the system prompt still comply.
      text_part = user_parts.find { |p| p["type"] == "text" }
      expect(text_part["text"]).to include("English")
      expect(text_part["text"]).to match(/JSON/i)

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
      # The contract is always all four keys. vital_badges/medical_terms come back
      # as empty arrays when the model omits them, so the client never has to
      # null-check them.
      expect(result).to eq(
        "summary" => "Iron deficiency",
        "questions" => ["a", "b", "c"],
        "vital_badges" => [],
        "medical_terms" => []
      )
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

    it "logs the full upstream response body on an error (e.g. 503 no-credits)" do
      body = JSON.generate("error" => { "message" => "Insufficient credits", "code" => 402 })
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do
          [503, { "Content-Type" => "application/json" }, body]
        end
      end

      allow(Rails.logger).to receive(:error)
      allow(Rails.logger).to receive(:warn)

      expect { service.analyze_document(fake_file, locale: "en") }
        .to raise_error(OpenRouterService::ApiError, /HTTP 503/)

      expect(Rails.logger).to have_received(:error)
        .with(/HTTP 503.*Insufficient credits.*response body:.*Insufficient credits/m)
        .at_least(:once)
    end
  end

  describe "#analyze_document multi-model fallback" do
    it "rolls over to the next candidate model when one fails, and returns its result" do
      seen_models = []
      calls = 0
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do |env|
          seen_models << JSON.parse(env.request_body)["model"]
          calls += 1
          if calls == 1
            [503, { "Content-Type" => "application/json" }, JSON.generate("error" => { "message" => "temporarily unavailable" })]
          else
            [200, { "Content-Type" => "application/json" }, ok_body(summary: "From fallback", questions: ["a", "b", "c"])]
          end
        end
      end

      result = service.analyze_document(fake_file, locale: "en")

      expect(result["summary"]).to eq("From fallback")
      # First the configured model, then the next candidate after the 503. Asserted
      # against MODELS rather than hardcoded slugs so retiring a model (as happened
      # to the llama-3.2 vision pair on 2026-07-29) updates this spec automatically
      # instead of failing it.
      expect(seen_models[0]).to eq(OpenRouterService::MODELS[0])
      expect(seen_models[1]).to eq(OpenRouterService::MODELS[1])
    end

    describe "OPENROUTER_MODELS override" do
      around do |example|
        original = ENV["OPENROUTER_MODELS"]
        example.run
        original.nil? ? ENV.delete("OPENROUTER_MODELS") : ENV["OPENROUTER_MODELS"] = original
      end

      it "falls back to the compiled-in defaults when unset" do
        ENV.delete("OPENROUTER_MODELS")
        expect(described_class.models).to eq(described_class::DEFAULT_MODELS)
      end

      it "replaces the default list, preserving order" do
        # Model naming is backend-specific: Google's OpenAI-compatible endpoint
        # wants bare slugs and 404s on OpenRouter's namespaced form, so repointing
        # the base URL has to be able to move the model list with it.
        ENV["OPENROUTER_MODELS"] = "gemini-2.5-flash,gemini-2.5-flash-lite"
        expect(described_class.models).to eq(%w[gemini-2.5-flash gemini-2.5-flash-lite])
      end

      it "tolerates whitespace, blanks and duplicates" do
        ENV["OPENROUTER_MODELS"] = " a ,, b ,a, "
        expect(described_class.models).to eq(%w[a b])
      end

      it "ignores a blank or whitespace-only value" do
        ENV["OPENROUTER_MODELS"] = "   "
        expect(described_class.models).to eq(described_class::DEFAULT_MODELS)
      end

      it "drives the models actually requested, in order" do
        ENV["OPENROUTER_MODELS"] = "first-model,second-model"
        seen = []
        stub_openrouter do |stubs|
          stubs.post("/api/v1/chat/completions") do |env|
            seen << JSON.parse(env.request_body)["model"]
            if seen.size == 1
              [503, { "Content-Type" => "application/json" }, JSON.generate("error" => { "message" => "busy" })]
            else
              [200, { "Content-Type" => "application/json" }, ok_body(summary: "S")]
            end
          end
        end

        described_class.new(api_key: api_key, base_url: base_url).analyze_document(fake_file, locale: "en")
        expect(seen).to eq(%w[first-model second-model])
      end

      it "still ignores the legacy singular OPENROUTER_MODEL" do
        ENV.delete("OPENROUTER_MODELS")
        original = ENV["OPENROUTER_MODEL"]
        ENV["OPENROUTER_MODEL"] = "some/stale-pinned-model"
        expect(described_class.models).to eq(described_class::DEFAULT_MODELS)
      ensure
        original.nil? ? ENV.delete("OPENROUTER_MODEL") : ENV["OPENROUTER_MODEL"] = original
      end
    end

    it "configures at least two candidates, so the lead model has somewhere to fall back to" do
      # Guards the regression found on 2026-07-29: two of three slugs had been
      # retired upstream, leaving the 'fallback chain' with no working fallback.
      expect(OpenRouterService::MODELS.size).to be >= 2
      expect(OpenRouterService::MODELS.uniq.size).to eq(OpenRouterService::MODELS.size)
    end

    it "rolls over past a 502 with a RAW STRING body (no #dig crash) to the next model" do
      # An upstream gateway 502 returns text/html, so the json middleware leaves
      # the body a raw String. This must not crash on #dig; it must raise ApiError
      # and let the fallback loop advance to the next candidate.
      calls = 0
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do
          calls += 1
          if calls == 1
            [502, { "Content-Type" => "text/html" }, "<html><body>502 Bad Gateway</body></html>"]
          else
            [200, { "Content-Type" => "application/json" }, ok_body(summary: "Recovered", questions: ["a", "b", "c"])]
          end
        end
      end

      result = service.analyze_document(fake_file, locale: "en")
      expect(result["summary"]).to eq("Recovered")
    end

    it "treats a 2xx with a non-JSON String body as an ApiError so the loop stays safe" do
      # A 200 whose body slipped past the json middleware as plain text must not
      # surface a bare JSON::ParserError; it becomes an ApiError and rolls over.
      calls = 0
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do
          calls += 1
          if calls == 1
            [200, { "Content-Type" => "text/plain" }, "not json at all"]
          else
            [200, { "Content-Type" => "application/json" }, ok_body(summary: "Recovered", questions: ["a", "b", "c"])]
          end
        end
      end

      allow(Rails.logger).to receive(:error)
      allow(Rails.logger).to receive(:warn)

      result = service.analyze_document(fake_file, locale: "en")
      expect(result["summary"]).to eq("Recovered")
    end

    it "raises an aggregated ApiError only after every candidate model fails" do
      seen_models = []
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do |env|
          seen_models << JSON.parse(env.request_body)["model"]
          [503, { "Content-Type" => "application/json" }, JSON.generate("error" => { "message" => "no endpoints" })]
        end
      end

      expect { service.analyze_document(fake_file, locale: "en") }
        .to raise_error(OpenRouterService::ApiError, /all_models_failed/)

      # Both distinct candidates were attempted before giving up.
      expect(seen_models.uniq).to eq(OpenRouterService::MODELS.to_a)
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

    it "classifies an unreachable host as host-level and stops after one attempt" do
      attempts = 0
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do
          attempts += 1
          raise Faraday::ConnectionFailed, "refused"
        end
      end

      expect { service.analyze_document(fake_file, locale: "en") }
        .to raise_error(OpenRouterService::UpstreamUnreachableError)
      # All candidates share this base URL, so retrying them would only add one
      # open-timeout each with no chance of succeeding.
      expect(attempts).to eq(1)
    end

    it "still rolls over across models on a READ timeout, which can be model-specific" do
      attempts = 0
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do
          attempts += 1
          raise Faraday::TimeoutError, "too slow" if attempts == 1

          [200, { "Content-Type" => "application/json" }, ok_body(summary: "Second model")]
        end
      end

      result = service.analyze_document(fake_file, locale: "en")
      expect(result["summary"]).to eq("Second model")
      expect(attempts).to eq(2)
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

  # Regression cover for the 2026-07-29 incident: every model returned an
  # identical 403 from a network intermediary, not from OpenRouter.
  describe "upstream interception (network-level block)" do
    # Byte-for-byte the body observed in-region. Note it is NOT OpenRouter's error
    # shape — theirs nests under "error" => { "message" => ... }.
    let(:block_body) { '{ "success": false, "error": "Access denied by security policy." }' }

    it "raises UpstreamBlockedError instead of a generic ApiError" do
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do
          [403, { "Content-Type" => "application/json" }, block_body]
        end
      end

      expect { service.analyze_document(fake_file, locale: "en") }
        .to raise_error(OpenRouterService::UpstreamBlockedError, /blocked_upstream/)
    end

    it "does NOT retry the other candidate models, since all would get the same reply" do
      attempts = 0
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do
          attempts += 1
          [403, { "Content-Type" => "application/json" }, block_body]
        end
      end

      expect { service.analyze_document(fake_file, locale: "en") }
        .to raise_error(OpenRouterService::UpstreamBlockedError)
      expect(attempts).to eq(1)
    end

    it "still rolls over on a genuine OpenRouter 403 (e.g. a disabled key)" do
      attempts = 0
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do
          attempts += 1
          if attempts == 1
            # OpenRouter's own shape: nested "error" object, no block marker.
            [403, { "Content-Type" => "application/json" },
             JSON.generate("error" => { "message" => "Key disabled", "code" => 403 })]
          else
            [200, { "Content-Type" => "application/json" }, ok_body(summary: "Recovered")]
          end
        end
      end

      result = service.analyze_document(fake_file, locale: "en")
      expect(result["summary"]).to eq("Recovered")
      expect(attempts).to eq(2)
    end

    it "is rescuable as an ApiError so existing callers keep working" do
      expect(OpenRouterService::UpstreamBlockedError.ancestors)
        .to include(OpenRouterService::ApiError)
    end
  end

  # Regression cover for the 2026-07-29 silent-tooltip bug: the model wrote its
  # summary in Persian but lifted medical_terms from the English source document,
  # so no term was a substring of the summary and the whole Jargon Decoder
  # rendered nothing behind a 200 OK.
  describe "medical_terms must be locatable in the summary" do
    def analyze_returning(payload)
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do
          [200, { "Content-Type" => "application/json" },
           JSON.generate("choices" => [{ "message" => { "content" => JSON.generate(payload) } }])]
        end
      end
      service.analyze_document(fake_file, locale: "fa")
    end

    it "drops terms that do not occur in the summary" do
      result = analyze_returning(
        "summary" => "نتایج نشان‌دهنده کم‌خونی فقر آهن است.",
        "questions" => %w[a b c],
        "vital_badges" => [],
        # Lifted from an English document; unlocatable in a Persian summary.
        "medical_terms" => [
          { "term" => "Iron deficiency", "definition" => "کمبود آهن." },
          { "term" => "Ferritin", "definition" => "ذخیره آهن." }
        ]
      )

      expect(result["medical_terms"]).to eq([])
    end

    it "keeps terms that are a literal substring of the summary" do
      result = analyze_returning(
        "summary" => "نتایج نشان‌دهنده کم‌خونی فقر آهن است.",
        "questions" => %w[a b c],
        "vital_badges" => [],
        "medical_terms" => [{ "term" => "کم‌خونی فقر آهن", "definition" => "کمبود آهن بدن." }]
      )

      expect(result["medical_terms"].map { |t| t["term"] }).to eq(["کم‌خونی فقر آهن"])
    end

    it "keeps only the locatable subset when the model returns a mix" do
      result = analyze_returning(
        "summary" => "Findings indicate iron deficiency anemia with low ferritin.",
        "questions" => %w[a b c],
        "vital_badges" => [],
        "medical_terms" => [
          { "term" => "ferritin", "definition" => "Stores iron." },
          { "term" => "Tachycardia", "definition" => "Fast heart rate." },
          { "term" => "iron deficiency anemia", "definition" => "Too little iron." }
        ]
      )

      expect(result["medical_terms"].map { |t| t["term"] })
        .to eq([ "ferritin", "iron deficiency anemia" ])
    end

    it "matches case-insensitively, so casing drift still renders" do
      result = analyze_returning(
        "summary" => "Findings indicate Iron Deficiency Anemia.",
        "questions" => %w[a b c],
        "vital_badges" => [],
        "medical_terms" => [{ "term" => "iron deficiency anemia", "definition" => "Too little iron." }]
      )

      expect(result["medical_terms"].size).to eq(1)
    end

    it "does not drop terms when the summary is blank (nothing to match against)" do
      # A blank summary means the raw-text fallback path; keep the data rather than
      # discarding it on a technicality.
      result = analyze_returning(
        "summary" => "",
        "questions" => %w[a b c],
        "vital_badges" => [],
        "medical_terms" => [{ "term" => "Ferritin", "definition" => "Stores iron." }]
      )

      expect(result["medical_terms"].map { |t| t["term"] }).to eq(["Ferritin"])
    end
  end

  describe "malformed JSON repair" do
    def content_body(text)
      JSON.generate("choices" => [{ "message" => { "content" => text } }])
    end

    def analyze_with(text)
      stub_openrouter do |stubs|
        stubs.post("/api/v1/chat/completions") do
          [200, { "Content-Type" => "application/json" }, content_body(text)]
        end
      end
      service.analyze_document(fake_file, locale: "en")
    end

    it "recovers a trailing comma before a closing bracket" do
      # The exact defect logged on 2026-07-28 ("unexpected character: '],'"),
      # which silently blanked vital_badges and medical_terms.
      result = analyze_with(<<~JSON)
        {
          "summary": "Iron deficiency anemia.",
          "questions": ["a", "b", "c"],
          "vital_badges": [
            { "label": "Hgb", "value": "10.2", "status": "warning", "icon": "🩸" },
          ],
          "medical_terms": []
        }
      JSON

      expect(result["summary"]).to eq("Iron deficiency anemia.")
      expect(result["vital_badges"].length).to eq(1)
      expect(result["vital_badges"].first["label"]).to eq("Hgb")
    end

    it "salvages complete fields from a response truncated at max_tokens" do
      result = analyze_with(
        '{"summary":"Anemia found.","questions":["a","b","c"],' \
        '"vital_badges":[{"label":"Hgb","value":"10.2","status":"warning","icon":"🩸"},{"label":"Ferrit'
      )

      expect(result["summary"]).to eq("Anemia found.")
      expect(result["questions"]).to eq(["a", "b", "c"])
      # The one COMPLETE badge survives; the half-written one is discarded.
      expect(result["vital_badges"].length).to eq(1)
    end

    it "leaves commas and brackets inside string values untouched" do
      result = analyze_with(
        '{"summary":"Values: 1, 2, and 3 [normal], fine.","questions":["why, though?"],' \
        '"vital_badges":[],"medical_terms":[]}'
      )

      expect(result["summary"]).to eq("Values: 1, 2, and 3 [normal], fine.")
      expect(result["questions"]).to eq(["why, though?"])
    end

    it "degrades to an empty structure on unrepairable output, without raising" do
      result = analyze_with("{{{ not json at all ]]]")
      expect(result["summary"]).to eq("")
      expect(result["questions"]).to eq([])
      expect(result["vital_badges"]).to eq([])
      expect(result["medical_terms"]).to eq([])
    end
  end
end
