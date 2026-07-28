require "base64"
require "json"
require "faraday"

# Talks to OpenRouter's OpenAI-compatible Chat Completions API to analyze a
# patient's uploaded medical document (lab result, imaging report, prescription)
# and return a short summary plus follow-up questions.
#
# OpenRouter speaks the OpenAI wire format, so the request is a standard
# `messages` array and the response is read from `choices[0].message.content`.
# The document itself is attached to the user turn as a data-URL content part:
# images ride in an `image_url` part; PDFs ride in a `file` part. Provider/model
# is a single string (e.g. "anthropic/claude-3.5-sonnet"), so switching models
# is a config change, not a code change.
#
# The base URL is configurable (OPENROUTER_BASE_URL). It defaults to OpenRouter
# directly, but can be pointed at a reverse proxy for regions where the endpoint
# is blocked — the previous Gemini integration relied on exactly such a proxy.
class OpenRouterService
  class ConfigurationError < StandardError; end
  # Raised for network timeouts, connection failures and non-2xx responses so
  # callers can degrade gracefully instead of leaking Faraday internals.
  class ApiError < StandardError; end

  # Ordered list of vision-capable models to try. Each reads IMAGES (as
  # `image_url` data-URLs) and PDFs (as `file` parts) — the exact shapes
  # document_part builds below — so the payload stays valid across the whole
  # chain, and a transient failure on the leading model rolls over to the next.
  # This array is authoritative: ENV["OPENROUTER_MODEL"] is intentionally NOT
  # consulted, so changing models means editing this list (a deploy).
  #
  # NOTE: an endpoint can still rate-limit or briefly 429/503/502 under load;
  # that's a transient upstream state, not a payload problem — hence the fallback
  # chain. Model availability/pricing on OpenRouter changes over time; keep these
  # slugs in sync with the currently-active tiers.
  #
  # ORDER MATTERS for output QUALITY, not just availability. We lead with Gemini
  # 2.5 Flash because it reliably honors response_format: json_object AND the
  # "answer in Persian/Sorani" instruction — which is what actually drives the
  # structured questionnaire popup. The Llama 3.2 vision models are kept as
  # fallbacks: they respond, but tend to ignore JSON-mode and reply in English,
  # which collapses to a raw-text summary with no questions (no popup).
  MODELS = [
    "google/gemini-2.5-flash",
    "meta-llama/llama-3.2-11b-vision-instruct",
    "meta-llama/llama-3.2-90b-vision-instruct"
  ].freeze

  DEFAULT_MODEL = MODELS.first
  DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"

  # Only image and PDF documents are supported. NOTE: PDF ingestion via the chat
  # API is model-dependent — Anthropic (Claude) models accept PDFs natively, but
  # a model without PDF vision will ignore or reject the file. Keep this aligned
  # with the configured model.
  SUPPORTED_MIME = ->(m) { m.to_s.start_with?("image/") || m.to_s == "application/pdf" }

  # Fail fast on a dead endpoint, but give the model room to think.
  OPEN_TIMEOUT = 5   # seconds to establish the connection
  READ_TIMEOUT = 45  # seconds to wait for the full response

  # Recommended OpenRouter attribution headers (surface the app on their
  # dashboard/rankings). Harmless if omitted; overridable via env.
  DEFAULT_REFERER = "https://healthino.app"
  DEFAULT_TITLE   = "Healthino AI"

  SUPPORTED_LOCALES = %w[fa ckb en].freeze
  DEFAULT_LOCALE    = "fa"

  # Human-readable language name injected into the prompt so the model responds
  # in the patient's selected UI language regardless of the document's language.
  LOCALE_LANGUAGE = {
    "fa"  => "Persian (Farsi)",
    "ckb" => "Central Kurdish (Sorani)",
    "en"  => "English"
  }.freeze

  # Human-readable language name for a (already-normalized) locale, used both in
  # the system prompt and to reinforce the target language in the user turn.
  def self.language_for(locale)
    LOCALE_LANGUAGE.fetch(locale, LOCALE_LANGUAGE[DEFAULT_LOCALE])
  end

  def self.build_prompt(locale)
    language = language_for(locale)
    <<~PROMPT
      You are a medical assistant reviewing a patient's uploaded medical document
      (such as a lab result, imaging report, or prescription).

      Analyze the document and respond with a single valid JSON object using exactly
      this shape:
      {
        "summary": "<a brief, plain-language summary of the key findings>",
        "questions": ["<question 1>", "<question 2>", "<question 3>"],
        "vital_badges": [
          { "label": "<indicator name>", "value": "<value or range>", "status": "normal", "icon": "🩸" }
        ]
      }

      Rules:
      - "summary" must be 1-3 short sentences describing the main findings.
      - "questions" must contain exactly 3 specific follow-up questions for the patient,
        directly based on the findings (e.g. clarifying symptoms, timeline, or medications).
      - "vital_badges" must be an array of 2 to 4 objects, each capturing a key vital
        sign or clinical indicator (e.g. blood sugar, hemoglobin, vitamin D, blood
        pressure, cholesterol, white blood cells). Extract the actual values found in
        the document. If the document contains no measurable indicators, infer 2-3 key
        health indicators from the described symptoms instead — never return an empty
        array. Each object must have exactly these keys:
          * "label": the indicator name, written in #{language}.
          * "value": the measured value or range as a short string (e.g. "11.5 mg/dL"),
            or a qualitative word in #{language} (e.g. the localized equivalent of
            "normal") when no number is available.
          * "status": STRICTLY one of "normal", "warning", or "critical" — lowercase
            English only. Use "normal" when the value is within the healthy range,
            "warning" when mildly out of range or borderline, and "critical" when
            severely abnormal or clinically urgent.
          * "icon": a single medical emoji relevant to the indicator (e.g. "🩸", "🧪",
            "❤️", "☀️", "🫁", "🦴").
      - Write the "summary", every "questions" entry, and every badge "label"/"value"
        entirely in #{language}, regardless of the language used in the document. Do NOT
        answer in English unless #{language} is English. The badge "status" is the only
        field that stays in English.
      - Respond with the JSON object only, without markdown fences or any extra text.
    PROMPT
  end

  def self.normalize_locale(locale)
    loc = locale.to_s.strip.downcase
    SUPPORTED_LOCALES.include?(loc) ? loc : DEFAULT_LOCALE
  end

  # Opt-in offline switch (AI_STUB=1). Lets the frontend exercise the full
  # document-analysis flow without a reachable endpoint or API key. This is
  # explicit only: it is never on by default, in any environment.
  def self.stub_enabled?
    ActiveModel::Type::Boolean.new.cast(ENV["AI_STUB"]) || false
  end

  def initialize(api_key: nil, model: nil, base_url: nil, referer: nil, title: nil)
    @api_key = api_key ||
               Rails.application.credentials.dig(:open_router, :api_key) ||
               ENV["OPENROUTER_API_KEY"]
    @base_url = (base_url || ENV["OPENROUTER_BASE_URL"].presence || DEFAULT_BASE_URL).to_s.strip.chomp("/")
    # The MODELS array is authoritative. We deliberately IGNORE
    # ENV["OPENROUTER_MODEL"] so a stale/misconfigured env override can't bypass
    # the vetted free-tier array (this is what kept pinning gemini-2.5-flash as
    # the lead model). An explicit constructor `model:` still leads when passed
    # (used in tests); otherwise candidate_models runs purely through MODELS.
    @model = model
    @referer = referer || ENV["OPENROUTER_REFERER"].presence || DEFAULT_REFERER
    @title = title || ENV["OPENROUTER_TITLE"].presence || DEFAULT_TITLE

    # In stub mode we never call the API, so missing config is fine.
    return if self.class.stub_enabled?

    raise ConfigurationError, "OPENROUTER_BASE_URL is not configured" if @base_url.blank?
    raise ConfigurationError, "OPENROUTER_API_KEY is not configured"  if @api_key.blank?
  end

  # Returns a Hash with "summary" (String), "questions" (Array<String>), and
  # "vital_badges" (Array<Hash>), written in the requested locale (fa / ckb / en).
  def analyze_document(file, locale: nil, prompt: nil)
    raise ArgumentError, "file is required" if file.blank?

    mime = file.respond_to?(:content_type) ? file.content_type.to_s : "application/octet-stream"
    raise ArgumentError, "unsupported_mime_type: #{mime}" unless SUPPORTED_MIME.call(mime)

    loc = self.class.normalize_locale(locale)
    prompt ||= self.class.build_prompt(loc)
    language = self.class.language_for(loc)

    # Short-circuit to canned data when the offline switch is on.
    return stub_analysis(loc) if self.class.stub_enabled?

    file.rewind if file.respond_to?(:rewind)
    encoded = Base64.strict_encode64(file.read.to_s)

    # System turn carries the instructions; the user turn carries the document as
    # a data-URL part. This preserves the OpenAI (system/user/assistant) message
    # contract OpenRouter expects.
    messages = [
      { role: "system", content: prompt },
      {
        role: "user",
        content: [
          { type: "text", text: "Analyze the attached medical document. Respond with the JSON object only (keys \"summary\", \"questions\", and \"vital_badges\"), and write every value in #{language} (badge \"status\" stays in English)." },
          document_part(mime, encoded)
        ]
      }
    ]

    parse_structured(extract_text(complete_with_fallback(messages)))
  end

  private

  # The models to try, in order. This is MODELS verbatim unless an explicit
  # constructor `model:` was passed (then it leads). ENV["OPENROUTER_MODEL"] is
  # intentionally NOT consulted here. A transient failure on one model rolls over
  # to the next. De-duplicated and order-preserving.
  def candidate_models
    ([@model] + MODELS).map { |m| m.to_s.strip }.reject(&:blank?).uniq
  end

  # Tries each candidate model in turn. ANY per-model failure — an ApiError
  # (non-2xx like 402/502/503), a transport error, or an unexpected exception
  # (e.g. a #dig/JSON surprise on a raw HTML/text gateway body) — is caught,
  # logged, and we advance to the next model. Nothing thrown while handling one
  # model is allowed to abort the whole sequence. Only when every candidate has
  # failed do we surface an aggregated error to the caller.
  def complete_with_fallback(messages)
    failures = []
    candidate_models.each do |model|
      return create_completion(build_body(model, messages))
    rescue => e
      failures << "#{model} → #{e.class}: #{e.message}"
      Rails.logger.warn("[OpenRouterService] model #{model} failed (#{e.class}: #{e.message}); trying next candidate")
      next
    end

    Rails.logger.error("[OpenRouterService] all #{failures.size} candidate models failed: #{failures.join(" | ")}")
    raise ApiError, "openrouter_all_models_failed (#{failures.join(" | ")})"
  end

  def build_body(model, messages)
    {
      model: model,
      messages: messages,
      # Hardcoded modest cap so the free/low-credit tier's affordability check
      # passes; without it OpenRouter reserves the model's full max output
      # (e.g. 65535) and rejects the request up-front. 2000 is ample for our
      # small JSON output (a short summary + 3 questions).
      max_tokens: 2000,
      # OpenAI-compatible structured-output hint (the analogue of Gemini's
      # responseMimeType: application/json).
      response_format: { type: "json_object" }
    }
  end

  # Wraps the document as an OpenAI-style content part. Images use `image_url`;
  # PDFs use the `file` part with a base64 data URL.
  def document_part(mime, encoded)
    if mime == "application/pdf"
      {
        type: "file",
        file: { filename: "document.pdf", file_data: "data:application/pdf;base64,#{encoded}" }
      }
    else
      { type: "image_url", image_url: { url: "data:#{mime};base64,#{encoded}" } }
    end
  end

  # Canned, localized response used only when AI_STUB is on. Mirrors the real
  # { "summary", "questions" } contract (a CBC/iron panel consistent with
  # iron-deficiency anemia) so the UI flow can be built offline.
  STUB_ANALYSIS = {
    "fa" => {
      "summary" => "آزمایش خون نشان‌دهنده‌ی کم‌خونی فقر آهن است: هموگلوبین و فریتین پایین‌تر از حد طبیعی و گلبول‌های قرمز کوچک‌تر از معمول گزارش شده‌اند. سایر شاخص‌ها در محدوده‌ی طبیعی قرار دارند.",
      "questions" => [
        "آیا احساس خستگی مفرط یا سرگیجه در طول روز دارید؟",
        "آیا در رژیم غذایی خود از منابع آهن مانند گوشت قرمز یا سبزیجات برگ‌سبز استفاده می‌کنید؟",
        "آیا اخیراً خونریزی غیرعادی (مثلاً قاعدگی شدید یا مشکلات گوارشی) داشته‌اید؟"
      ],
      "vital_badges" => [
        { "label" => "هموگلوبین", "value" => "10.2 g/dL", "status" => "warning", "icon" => "🩸" },
        { "label" => "فریتین", "value" => "8 ng/mL", "status" => "critical", "icon" => "🧪" },
        { "label" => "قند خون", "value" => "95 mg/dL", "status" => "normal", "icon" => "🍬" }
      ]
    },
    "en" => {
      "summary" => "The blood test indicates iron-deficiency anemia: hemoglobin and ferritin are below the normal range and the red blood cells are smaller than usual. All other markers are within normal limits.",
      "questions" => [
        "Do you feel excessive fatigue or dizziness during the day?",
        "Does your diet include iron sources such as red meat or leafy green vegetables?",
        "Have you had any unusual bleeding recently (e.g. heavy menstruation or digestive issues)?"
      ],
      "vital_badges" => [
        { "label" => "Hemoglobin", "value" => "10.2 g/dL", "status" => "warning", "icon" => "🩸" },
        { "label" => "Ferritin", "value" => "8 ng/mL", "status" => "critical", "icon" => "🧪" },
        { "label" => "Blood Sugar", "value" => "95 mg/dL", "status" => "normal", "icon" => "🍬" }
      ]
    },
    "ckb" => {
      "summary" => "پشکنینی خوێن ئاماژە بە کەمخوێنی کەمی ئاسن دەکات: هیمۆگلۆبین و فێریتین لە ئاستی ئاسایی کەمترن و خانە سوورەکانی خوێن لە ئاساییەوە بچووکترن. هەموو پێوەرەکانی تر لە سنووری ئاساییدان.",
      "questions" => [
        "ئایا بە درێژایی ڕۆژ هەست بە ماندووبوونی زۆر یان سەرگێژە دەکەیت؟",
        "ئایا لە خۆراکەکەتدا سەرچاوەی ئاسن وەک گۆشتی سوور یان سەوزەی گەڵا سەوز هەیە؟",
        "ئایا ئەم دواییە خوێنبەربوونی نائاسایت هەبووە (بۆ نموونە سووڕی مانگانەی قورس یان کێشەی گەدە)؟"
      ],
      "vital_badges" => [
        { "label" => "هیمۆگلۆبین", "value" => "10.2 g/dL", "status" => "warning", "icon" => "🩸" },
        { "label" => "فێریتین", "value" => "8 ng/mL", "status" => "critical", "icon" => "🧪" },
        { "label" => "شەکری خوێن", "value" => "95 mg/dL", "status" => "normal", "icon" => "🍬" }
      ]
    }
  }.freeze

  def stub_analysis(locale = DEFAULT_LOCALE)
    loc = self.class.normalize_locale(locale)
    Rails.logger.warn("[OpenRouterService] AI_STUB on — returning canned analysis (locale: #{loc})")
    STUB_ANALYSIS.fetch(loc, STUB_ANALYSIS[DEFAULT_LOCALE])
  end

  # POSTs to {base}/chat/completions with Bearer auth and OpenRouter's optional
  # attribution headers. Returns the parsed response Hash.
  def create_completion(body)
    response = connection.post("chat/completions") do |req|
      req.headers["Authorization"] = "Bearer #{@api_key}"
      req.headers["HTTP-Referer"]  = @referer
      req.headers["X-Title"]       = @title
      req.body = body
    end

    unless response.success?
      # Log the exact upstream response verbatim so 401/402/429/503 (bad key, no
      # credits, rate limit, model unavailable) are debuggable from the Rails
      # console. We serialize the full body — a parsed Hash pretty-prints, a raw
      # string passes through — rather than only the nested error.message.
      #
      # OpenRouter's own app-level errors arrive as a Hash ({ "error" => {...} }),
      # but an upstream GATEWAY failure (502 Bad Gateway / 504) or an in-region
      # proxy often returns a RAW STRING (HTML or plain text) that never went
      # through the json middleware. #dig exists on Hash, not String, so we only
      # reach for the nested message when the body is actually a Hash; a String
      # body is treated as the raw error text. Either way we raise ApiError below
      # so complete_with_fallback rolls over to the next candidate model.
      body     = response.body
      raw_body = body.is_a?(String) ? body : body.inspect
      # Only Hash exposes a nested error message. Guarded AND wrapped: a String
      # (HTML/text from a 502/504 gateway) or any other non-Hash never reaches
      # #dig, and even an unexpected object can't raise here.
      message  =
        begin
          body.is_a?(Hash) ? body.dig("error", "message") : nil
        rescue StandardError
          nil
        end

      # Print the exact upstream body straight to the server stdout/terminal for
      # quick eyeballing during debugging (in addition to the structured log).
      puts "--- OPENROUTER ERROR BODY: #{raw_body} ---"

      Rails.logger.error(
        "[OpenRouterService] OpenRouter API error HTTP #{response.status}" \
        "#{" — #{message}" if message.present?}\n" \
        "[OpenRouterService] response body: #{raw_body}"
      )
      raise ApiError, "openrouter_api_error (HTTP #{response.status})"
    end

    # Happy path: the json middleware already parsed a Hash. If a 2xx slips
    # through with a non-Hash body (a raw String from a proxy/CDN, or JSON that
    # decodes to a non-object), we parse defensively and raise ApiError — never a
    # bare JSON::ParserError/TypeError — so the fallback loop advances cleanly.
    body = response.body
    return body if body.is_a?(Hash)

    parsed = JSON.parse(body.to_s)
    return parsed if parsed.is_a?(Hash)

    Rails.logger.error("[OpenRouterService] 2xx body was not a JSON object: #{body.inspect}")
    raise ApiError, "openrouter_unexpected_body"
  rescue JSON::ParserError => e
    Rails.logger.error("[OpenRouterService] 2xx body was not valid JSON: #{e.message}")
    raise ApiError, "openrouter_unparseable_body"
  rescue Faraday::TimeoutError => e
    Rails.logger.error("[OpenRouterService] request timed out: #{e.message}")
    raise ApiError, "openrouter_timeout"
  rescue Faraday::ConnectionFailed => e
    Rails.logger.error("[OpenRouterService] could not reach endpoint #{@base_url}: #{e.message}")
    raise ApiError, "openrouter_unreachable"
  rescue Faraday::Error => e
    Rails.logger.error("[OpenRouterService] transport error: #{e.class}: #{e.message}")
    raise ApiError, "openrouter_request_failed"
  end

  def connection
    @connection ||= Faraday.new(url: "#{@base_url}/") do |f|
      f.request :json
      f.response :json, content_type: /\bjson/
      f.options.open_timeout = OPEN_TIMEOUT
      f.options.timeout = READ_TIMEOUT
    end
  end

  # Reads the assistant's text from the OpenAI-shaped response. create_completion
  # only ever returns a Hash, but we guard the type anyway: #dig belongs to Hash,
  # and calling it on a String (NoMethodError) or an Array-with-string-keys
  # (TypeError) would crash outside the ApiError rescue. A non-Hash yields "".
  def extract_text(response)
    return "" unless response.is_a?(Hash)

    response.dig("choices", 0, "message", "content").to_s.strip
  end

  # Parses the model's text into a normalized { "summary", "questions" } hash,
  # tolerating markdown fences or stray prose around the JSON object. If the
  # model returns malformed JSON, we never crash the request: we fall back to
  # surfacing the raw text as the summary so the client still gets a response.
  def parse_structured(text)
    data =
      begin
        json = extract_json_object(text)
        json ? JSON.parse(json) : {}
      rescue JSON::ParserError => e
        Rails.logger.warn("[OpenRouterService] JSON parse failed, using raw fallback: #{e.message}")
        {}
      end
    data = {} unless data.is_a?(Hash)

    summary = data["summary"].to_s.strip
    questions = Array(data["questions"]).map { |q| q.to_s.strip }.reject(&:blank?)
    vital_badges = normalize_badges(data["vital_badges"])

    # Fallback: if the model ignored the JSON contract, surface the raw text as
    # the summary so the client still gets something useful.
    summary = text.to_s.strip if summary.blank? && questions.empty?

    { "summary" => summary, "questions" => questions, "vital_badges" => vital_badges }
  end

  # Valid badge statuses (drive the coloured pill in the UI). Anything the model
  # returns outside this set — a typo, a translated word, a missing value — is
  # coerced to "normal" so the frontend never has to guard against junk.
  BADGE_STATUSES = %w[normal warning critical].freeze
  DEFAULT_BADGE_STATUS = "normal"

  # Normalizes the model's `vital_badges` into a clean array of
  # { "label", "value", "status", "icon" } hashes. Tolerant of missing keys,
  # non-array input, and non-hash entries; drops any entry with a blank label so
  # the UI only ever renders meaningful pills.
  def normalize_badges(raw)
    Array(raw).filter_map do |b|
      next unless b.is_a?(Hash)

      label = b["label"].to_s.strip
      next if label.blank?

      status = b["status"].to_s.strip.downcase
      status = DEFAULT_BADGE_STATUS unless BADGE_STATUSES.include?(status)

      {
        "label"  => label,
        "value"  => b["value"].to_s.strip,
        "status" => status,
        "icon"   => b["icon"].to_s.strip
      }
    end
  end

  def extract_json_object(text)
    str = text.to_s.strip
    str = str.gsub(/\A```(?:json)?\s*/i, "").gsub(/\s*```\z/, "").strip
    start = str.index("{")
    finish = str.rindex("}")
    return nil if start.nil? || finish.nil? || finish < start

    str[start..finish]
  end
end
