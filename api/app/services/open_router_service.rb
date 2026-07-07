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

  # A premium, stable default. Any OpenRouter model slug works; override with
  # OPENROUTER_MODEL to flip models without a deploy.
  DEFAULT_MODEL = "anthropic/claude-3.5-sonnet"
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

  def self.build_prompt(locale)
    language = LOCALE_LANGUAGE.fetch(locale, LOCALE_LANGUAGE[DEFAULT_LOCALE])
    <<~PROMPT
      You are a medical assistant reviewing a patient's uploaded medical document
      (such as a lab result, imaging report, or prescription).

      Analyze the document and respond with a single valid JSON object using exactly
      this shape:
      {
        "summary": "<a brief, plain-language summary of the key findings>",
        "questions": ["<question 1>", "<question 2>", "<question 3>"]
      }

      Rules:
      - "summary" must be 1-3 short sentences describing the main findings.
      - "questions" must contain exactly 3 specific follow-up questions for the patient,
        directly based on the findings (e.g. clarifying symptoms, timeline, or medications).
      - Write the "summary" and every "questions" entry entirely in #{language},
        regardless of the language used in the document.
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
    @model = model || ENV["OPENROUTER_MODEL"].presence || DEFAULT_MODEL
    @referer = referer || ENV["OPENROUTER_REFERER"].presence || DEFAULT_REFERER
    @title = title || ENV["OPENROUTER_TITLE"].presence || DEFAULT_TITLE

    # In stub mode we never call the API, so missing config is fine.
    return if self.class.stub_enabled?

    raise ConfigurationError, "OPENROUTER_BASE_URL is not configured" if @base_url.blank?
    raise ConfigurationError, "OPENROUTER_API_KEY is not configured"  if @api_key.blank?
  end

  # Returns a Hash with "summary" (String) and "questions" (Array<String>),
  # written in the requested locale (fa / ckb / en).
  def analyze_document(file, locale: nil, prompt: nil)
    raise ArgumentError, "file is required" if file.blank?

    mime = file.respond_to?(:content_type) ? file.content_type.to_s : "application/octet-stream"
    raise ArgumentError, "unsupported_mime_type: #{mime}" unless SUPPORTED_MIME.call(mime)

    loc = self.class.normalize_locale(locale)
    prompt ||= self.class.build_prompt(loc)

    # Short-circuit to canned data when the offline switch is on.
    return stub_analysis(loc) if self.class.stub_enabled?

    file.rewind if file.respond_to?(:rewind)
    encoded = Base64.strict_encode64(file.read.to_s)

    body = {
      model: @model,
      # System turn carries the instructions; the user turn carries the document
      # as a data-URL part. This preserves the OpenAI (system/user/assistant)
      # message contract OpenRouter expects.
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze the attached medical document." },
            document_part(mime, encoded)
          ]
        }
      ],
      # OpenAI-compatible structured-output hint (the analogue of Gemini's
      # responseMimeType: application/json).
      response_format: { type: "json_object" }
    }

    parse_structured(extract_text(create_completion(body)))
  end

  private

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
      ]
    },
    "en" => {
      "summary" => "The blood test indicates iron-deficiency anemia: hemoglobin and ferritin are below the normal range and the red blood cells are smaller than usual. All other markers are within normal limits.",
      "questions" => [
        "Do you feel excessive fatigue or dizziness during the day?",
        "Does your diet include iron sources such as red meat or leafy green vegetables?",
        "Have you had any unusual bleeding recently (e.g. heavy menstruation or digestive issues)?"
      ]
    },
    "ckb" => {
      "summary" => "پشکنینی خوێن ئاماژە بە کەمخوێنی کەمی ئاسن دەکات: هیمۆگلۆبین و فێریتین لە ئاستی ئاسایی کەمترن و خانە سوورەکانی خوێن لە ئاساییەوە بچووکترن. هەموو پێوەرەکانی تر لە سنووری ئاساییدان.",
      "questions" => [
        "ئایا بە درێژایی ڕۆژ هەست بە ماندووبوونی زۆر یان سەرگێژە دەکەیت؟",
        "ئایا لە خۆراکەکەتدا سەرچاوەی ئاسن وەک گۆشتی سوور یان سەوزەی گەڵا سەوز هەیە؟",
        "ئایا ئەم دواییە خوێنبەربوونی نائاسایت هەبووە (بۆ نموونە سووڕی مانگانەی قورس یان کێشەی گەدە)؟"
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
      detail = response.body.is_a?(Hash) ? response.body.dig("error", "message") : response.body
      Rails.logger.error("[OpenRouterService] OpenRouter API #{response.status}: #{detail}")
      raise ApiError, "openrouter_api_error (HTTP #{response.status})"
    end

    response.body.is_a?(Hash) ? response.body : JSON.parse(response.body.to_s)
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

  # Reads the assistant's text from the OpenAI-shaped response.
  def extract_text(response)
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

    # Fallback: if the model ignored the JSON contract, surface the raw text as
    # the summary so the client still gets something useful.
    summary = text.to_s.strip if summary.blank? && questions.empty?

    { "summary" => summary, "questions" => questions }
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
