require "base64"
require "json"
require "faraday"

# Talks to the Gemini generateContent API through our Cloudflare Worker reverse
# proxy (see cloudflare-worker/worker.js). The proxy forwards verbatim to
# https://generativelanguage.googleapis.com, which lets us reach Gemini from
# regions where Google blocks direct access.
#
# Only the base URL changes: the path, headers and JSON body are exactly what
# Google expects, so the proxy stays a dumb pass-through.
class GeminiService
  class ConfigurationError < StandardError; end
  # Raised for network timeouts, connection failures and non-2xx responses so
  # callers can degrade gracefully instead of leaking Faraday internals.
  class ApiError < StandardError; end

  # gemini-2.5-flash is multimodal (handles images + PDFs) and cheap/fast, which
  # fits the single-document analysis flow. The 1.5 line is retired and now
  # returns HTTP 404 from generateContent. Override with GEMINI_MODEL if needed.
  DEFAULT_MODEL  = "gemini-2.5-flash"
  SUPPORTED_MIME = ->(m) { m.to_s.start_with?("image/") || m.to_s == "application/pdf" }

  # Fail fast on a dead/blocked proxy, but give the model room to think.
  OPEN_TIMEOUT = 5   # seconds to establish the connection
  READ_TIMEOUT = 45  # seconds to wait for the full response

  SUPPORTED_LOCALES = %w[fa ckb en].freeze
  DEFAULT_LOCALE    = "fa"

  # Human-readable language name injected into the prompt so Gemini responds in
  # the patient's selected UI language regardless of the document's language.
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

  # Opt-in offline switch (GEMINI_STUB=1). Lets the frontend exercise the full
  # document-analysis flow without a reachable proxy or API key — e.g. when
  # Google is geo-blocked and the Worker isn't deployed yet. This is explicit
  # only: it is never on by default, in any environment.
  def self.stub_enabled?
    ActiveModel::Type::Boolean.new.cast(ENV["GEMINI_STUB"]) || false
  end

  def initialize(api_key: nil, model: nil, proxy_url: nil)
    @api_key = api_key ||
               Rails.application.credentials.dig(:gemini, :api_key) ||
               ENV["GEMINI_API_KEY"]
    @proxy_url = (proxy_url || ENV["GEMINI_PROXY_URL"]).to_s.strip.chomp("/")
    @model = model || ENV["GEMINI_MODEL"].presence || DEFAULT_MODEL

    # In stub mode we never call the API, so missing config is fine.
    return if self.class.stub_enabled?

    raise ConfigurationError, "GEMINI_PROXY_URL is not configured" if @proxy_url.blank?
    raise ConfigurationError, "GEMINI_API_KEY is not configured"   if @api_key.blank?
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
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mime, data: encoded } }
          ]
        }
      ],
      generationConfig: { responseMimeType: "application/json" }
    }

    parse_structured(extract_text(generate_content(body)))
  end

  private

  # Canned, localized response used only when GEMINI_STUB is on. Mirrors the
  # real { "summary", "questions" } contract (a CBC/iron panel consistent with
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
    Rails.logger.warn("[GeminiService] GEMINI_STUB on — returning canned analysis (locale: #{loc})")
    STUB_ANALYSIS.fetch(loc, STUB_ANALYSIS[DEFAULT_LOCALE])
  end

  # POSTs to {proxy}/v1beta/models/{model}:generateContent. The API key travels
  # in the x-goog-api-key header (not the query string) so it stays out of proxy
  # and access logs. Returns the parsed response Hash.
  def generate_content(body)
    response = connection.post("v1beta/models/#{@model}:generateContent") do |req|
      req.headers["x-goog-api-key"] = @api_key
      req.body = body
    end

    unless response.success?
      detail = response.body.is_a?(Hash) ? response.body.dig("error", "message") : response.body
      Rails.logger.error("[GeminiService] Gemini API #{response.status}: #{detail}")
      raise ApiError, "gemini_api_error (HTTP #{response.status})"
    end

    response.body.is_a?(Hash) ? response.body : JSON.parse(response.body.to_s)
  rescue Faraday::TimeoutError => e
    Rails.logger.error("[GeminiService] request timed out: #{e.message}")
    raise ApiError, "gemini_timeout"
  rescue Faraday::ConnectionFailed => e
    Rails.logger.error("[GeminiService] could not reach proxy #{@proxy_url}: #{e.message}")
    raise ApiError, "gemini_unreachable"
  rescue Faraday::Error => e
    Rails.logger.error("[GeminiService] transport error: #{e.class}: #{e.message}")
    raise ApiError, "gemini_request_failed"
  end

  def connection
    @connection ||= Faraday.new(url: "#{@proxy_url}/") do |f|
      f.request :json
      f.response :json, content_type: /\bjson/
      f.options.open_timeout = OPEN_TIMEOUT
      f.options.timeout = READ_TIMEOUT
    end
  end

  def extract_text(response)
    parts = response.dig("candidates", 0, "content", "parts") || []
    parts.map { |p| p["text"] }.compact.join("\n").strip
  end

  # Parses the model's text into a normalized { "summary", "questions" } hash,
  # tolerating markdown fences or stray prose around the JSON object. If Gemini
  # returns malformed JSON, we never crash the request: we fall back to surfacing
  # the raw text as the summary so the client still gets a usable response.
  def parse_structured(text)
    data =
      begin
        json = extract_json_object(text)
        json ? JSON.parse(json) : {}
      rescue JSON::ParserError => e
        Rails.logger.warn("[GeminiService] JSON parse failed, using raw fallback: #{e.message}")
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
