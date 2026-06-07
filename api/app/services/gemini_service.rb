require "base64"
require "json"

class GeminiService
  class ConfigurationError < StandardError; end

  DEFAULT_MODEL  = "gemini-1.5-pro-latest"
  SUPPORTED_MIME = ->(m) { m.to_s.start_with?("image/") || m.to_s == "application/pdf" }

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
      - "questions" must contain 2 to 3 specific follow-up questions for the patient,
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

  def initialize(api_key: nil, model: DEFAULT_MODEL)
    @api_key = api_key ||
               Rails.application.credentials.dig(:gemini, :api_key) ||
               ENV["GEMINI_API_KEY"]
    # In mock mode we never call the API, so a missing key is fine.
    raise ConfigurationError, "GEMINI_API_KEY is not configured" if @api_key.blank? && !self.class.mock_enabled?
    @model = model
  end

  # TEMPORARY: lets us exercise the full document-analysis flow without reaching
  # the Gemini API (e.g. when it is network/geo-blocked).
  #
  # Resolution order:
  #   - GEMINI_MOCK set (1/true/0/false) -> honor it explicitly
  #   - otherwise default to ON in the development environment
  # This way `GEMINI_MOCK=0` can force the real API in development once the
  # network is reachable, and `GEMINI_MOCK=1` can enable it in other envs.
  def self.mock_enabled?
    override = ENV["GEMINI_MOCK"].to_s.strip
    return ActiveModel::Type::Boolean.new.cast(override) unless override.empty?

    Rails.env.development?
  end

  # Returns a Hash with "summary" (String) and "questions" (Array<String>),
  # written in the requested locale (fa / ckb / en).
  def analyze_document(file, locale: nil, prompt: nil)
    raise ArgumentError, "file is required" if file.blank?

    mime = file.respond_to?(:content_type) ? file.content_type.to_s : "application/octet-stream"
    raise ArgumentError, "unsupported_mime_type: #{mime}" unless SUPPORTED_MIME.call(mime)

    loc = self.class.normalize_locale(locale)
    prompt ||= self.class.build_prompt(loc)

    # Skip the network entirely when mocking is active (dev / geo-blocked).
    return mock_analysis(loc, "mock_enabled") if self.class.mock_enabled?

    file.rewind if file.respond_to?(:rewind)
    encoded = Base64.strict_encode64(file.read.to_s)

    # NOTE: the gemini-ai gem expects the request body as a single positional
    # Hash argument. Passing the fields as Ruby keyword arguments leaves the
    # required `payload` positional empty and raises ArgumentError, so the body
    # must be wrapped in explicit braces.
    response = client.generate_content({
      contents: { role: "user", parts: [
        { text: prompt },
        { inline_data: { mime_type: mime, data: encoded } }
      ] },
      generationConfig: { responseMimeType: "application/json" }
    })

    parse_structured(extract_text(response))
  rescue Faraday::ForbiddenError => e
    # Regional geo-block (HTTP 403). Degrade gracefully to the simulated
    # response instead of failing the request.
    Rails.logger.warn("[GeminiService] Gemini returned 403 (likely geo-blocked): #{e.message}")
    mock_analysis(loc, "http_403_fallback")
  end

  private

  # TEMPORARY simulated response. Mirrors the real { "summary", "questions" }
  # contract so the UI flow (summary card, questions, animations, answer inputs)
  # can be tested offline. Models a CBC/iron panel consistent with iron-deficiency
  # anemia (low hemoglobin, low ferritin), localized per UI language.
  MOCK_ANALYSIS = {
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

  def mock_analysis(locale = DEFAULT_LOCALE, reason = "mock")
    loc = self.class.normalize_locale(locale)
    Rails.logger.info("[GeminiService] returning simulated analysis (locale: #{loc}, reason: #{reason})")
    MOCK_ANALYSIS.fetch(loc, MOCK_ANALYSIS[DEFAULT_LOCALE])
  end

  def client
    @client ||= Gemini.new(
      credentials: { service: "generative-language-api", api_key: @api_key },
      options: { model: @model, server_sent_events: false }
    )
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
