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

  # Failures that are properties of the HOST, not of the chosen model. Every
  # candidate in MODELS is requested from the same base URL, so swapping the model
  # slug cannot change the outcome — the fallback loop short-circuits on these
  # instead of burning one open-timeout per candidate (3 candidates × 5s = 15s of
  # dead wait before the user sees an error).
  class HostLevelError < ApiError; end

  # The request never reached OpenRouter: an intermediary (ISP filter, national
  # firewall, WAF) answered on its behalf.
  #
  # Signature seen in-region (2026-07): a bare 403 whose body is
  # {"success": false, "error": "Access denied by security policy."} — note this
  # is NOT OpenRouter's error shape (theirs nests under "error" => {"message"...}).
  # Reproduce with an unauthenticated GET, which proves it is upstream of auth:
  #   curl -i https://openrouter.ai/api/v1/models   # => 403, same body, no key sent
  class UpstreamBlockedError < HostLevelError; end

  # The TCP/TLS connection to the host could not be established at all (DNS
  # failure, refused, reset). Distinct from a read timeout, which can legitimately
  # be the model being slow and therefore IS worth retrying on another model.
  class UpstreamUnreachableError < HostLevelError; end

  # Body markers that identify an interception response rather than a genuine
  # OpenRouter reply. Matched case-insensitively against the raw body text.
  BLOCK_MARKERS = [
    "access denied by security policy",
    "access denied",
    "blocked by",
    "forbidden by policy"
  ].freeze

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
  # structured questionnaire popup.
  #
  # EVERY ENTRY MUST ACCEPT IMAGE INPUT. This chain analyzes uploaded documents,
  # so a text-only model cannot serve as a fallback no matter how capable it is —
  # it would receive an image part it cannot read. (Notably llama-3.3-70b-instruct
  # is text-only and is NOT a valid fallback here, despite being a common suggestion.)
  #
  # Verify these slugs against the live catalog with:
  #   bin/rails openrouter:verify_models
  #
  # 2026-07-29: dropped meta-llama/llama-3.2-11b-vision-instruct and
  # meta-llama/llama-3.2-90b-vision-instruct — OpenRouter now answers both with
  # 404 "No endpoints found for <slug>", i.e. they have been retired. The chain had
  # silently degraded to a single working model. claude-3.5-sonnet replaces them:
  # it reads images AND PDFs natively and is the model this service was originally
  # migrated onto (commit 1ce738f), so it is known-good for this payload shape.
  DEFAULT_MODELS = [
    "google/gemini-2.5-flash",
    "anthropic/claude-3.5-sonnet"
  ].freeze

  # Model slugs are BACKEND-SPECIFIC, and the backend is a deployment choice
  # (OPENROUTER_BASE_URL). OpenRouter namespaces them ("google/gemini-2.5-flash");
  # Google's own OpenAI-compatible endpoint wants the bare name
  # ("gemini-2.5-flash") and 404s on the namespaced form. So when the base URL is
  # repointed, the model list has to move with it — otherwise every candidate fails
  # with a slug error and the service looks broken for a config reason.
  #
  # OPENROUTER_MODELS (comma-separated, ordered) therefore replaces this list when
  # set. Note this is deliberately NOT the old singular ENV["OPENROUTER_MODEL"],
  # which stays ignored: that one existed as a stale leftover that silently pinned
  # the lead model. This override is plural, explicitly parsed, and logged on use,
  # so it can never take effect unnoticed.
  #
  #   OPENROUTER_MODELS="gemini-2.5-flash,gemini-2.0-flash"
  def self.models
    override = ENV["OPENROUTER_MODELS"].to_s.split(",").map(&:strip).reject(&:blank?)
    return DEFAULT_MODELS if override.empty?

    override.uniq
  end

  # Kept as a constant for callers/specs that reference the compiled-in default.
  MODELS = DEFAULT_MODELS

  DEFAULT_MODEL = DEFAULT_MODELS.first
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
        ],
        "medical_terms": [
          { "term": "<technical term exactly as written in the summary>", "definition": "<simple patient-friendly explanation>" }
        ]
      }

      Rules:
      - "summary": 1-3 short sentences on the main findings.
      - "questions": exactly 3 specific follow-up questions based on the findings
        (clarifying symptoms, timeline, or medications).
      - "vital_badges": 2 to 4 objects, each a key vital sign or clinical indicator
        (blood sugar, hemoglobin, vitamin D, blood pressure, cholesterol, white blood
        cells). Use the actual values in the document; if it has no measurable
        indicators, infer 2-3 from the described symptoms. Never return an empty array.
        Keys, exactly:
          * "label": indicator name in #{language}. Max 4 words.
          * "value": short value or range (e.g. "11.5 mg/dL"), or one qualitative word
            in #{language} when no number is available.
          * "status": STRICTLY "normal", "warning", or "critical" — lowercase English.
            normal = healthy range, warning = borderline, critical = severely abnormal.
          * "icon": one medical emoji (e.g. "🩸", "🧪", "❤️", "☀️", "🫁", "🦴").
      - "medical_terms": at most 5 technical terms. Keys, exactly:
          * "term": copy-paste of a substring of YOUR OWN "summary" text above.
            CRITICAL: the client locates each "term" inside "summary" by exact string
            match to attach a tooltip. A "term" that is not a literal substring of
            "summary" is silently discarded and the patient sees nothing.
            - Copy the characters from your "summary", which you wrote in #{language}.
            - Do NOT copy terms from the source document — the document may be in a
              different language than your summary.
            - Do NOT translate, transliterate, re-case, or reword the term.
            - Do NOT use English unless your "summary" itself is in English.
            Example of the ONLY correct behaviour: if your summary contains
            "کم‌خونی فقر آهن", then "term" is "کم‌خونی فقر آهن" — never "iron
            deficiency anemia", even if the document said that.
          * "definition": one plain sentence in #{language}, UNDER 15 WORDS. Be concise.
        Pick the terms AFTER writing "summary", by re-reading it and selecting words
        from it. If "summary" has no technical jargon, return [].
      - Write "summary", each question, each badge "label"/"value", and each
        "definition" in #{language}, whatever language the document uses. Do NOT answer
        in English unless #{language} is English. Only badge "status" and "term" are
        exempt.
      - Keep the whole response compact — no filler, no repetition.
      - Respond with the JSON object only: no markdown fences, no extra text.
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

    log_backend_configuration
  end

  # Returns a Hash with "summary" (String), "questions" (Array<String>),
  # "vital_badges" (Array<Hash>), and "medical_terms" (Array<Hash>), written in
  # the requested locale (fa / ckb / en).
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
          { type: "text", text: "Analyze the attached medical document. Respond with the JSON object only (keys \"summary\", \"questions\", \"vital_badges\", and \"medical_terms\"), and write every value in #{language} (badge \"status\" and each term's \"term\" stay as-is)." },
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
    ([ @model ] + self.class.models).map { |m| m.to_s.strip }.reject(&:blank?).uniq
  end

  # Records which backend and model list are actually in play. Both are
  # deployment-time choices, and a mismatch between them (namespaced slugs against
  # a non-OpenRouter endpoint, or vice versa) fails every candidate for a reason
  # that is invisible in the request itself — so it is stated once, up front.
  def log_backend_configuration
    return if @logged_backend

    @logged_backend = true
    if ENV["OPENROUTER_MODELS"].present?
      Rails.logger.info(
        "[OpenRouterService] base_url=#{@base_url} | models=#{self.class.models.join(', ')} " \
        "(OVERRIDDEN via OPENROUTER_MODELS)"
      )
    else
      Rails.logger.info(
        "[OpenRouterService] base_url=#{@base_url} | models=#{self.class.models.join(', ')} (compiled-in defaults)"
      )
    end
  end

  # Tries each candidate model in turn. ANY per-model failure — an ApiError
  # (non-2xx like 402/502/503), a transport error, or an unexpected exception
  # (e.g. a #dig/JSON surprise on a raw HTML/text gateway body) — is caught,
  # logged, and we advance to the next model. Nothing thrown while handling one
  # model is allowed to abort the whole sequence. Only when every candidate has
  # failed do we surface an aggregated error to the caller.
  # NOTE the one deliberate exception to "advance on any failure": a
  # HostLevelError re-raises immediately. When the host is blocked or unreachable,
  # the model slug in the body is irrelevant — all N candidates share this base URL
  # and would fail identically, so looping just multiplies the latency (one open
  # timeout each) and buries the real cause under N duplicate log lines. Fail fast
  # and let the caller report a network problem instead of a model problem.
  def complete_with_fallback(messages)
    failures = []
    candidate_models.each do |model|
      return create_completion(build_body(model, messages))
    rescue HostLevelError => e
      Rails.logger.error(
        "[OpenRouterService] #{@base_url} is blocked or unreachable (#{e.message}); " \
        "skipping the remaining candidate models — they share this host, so retrying " \
        "cannot help. Set OPENROUTER_BASE_URL to a reachable reverse proxy."
      )
      raise
    rescue => e
      failures << "#{model} → #{e.class}: #{e.message}"
      Rails.logger.warn("[OpenRouterService] model #{model} failed (#{e.class}: #{e.message}); trying next candidate")
      next
    end

    Rails.logger.error("[OpenRouterService] all #{failures.size} candidate models failed: #{failures.join(" | ")}")
    raise ApiError, "openrouter_all_models_failed (#{failures.join(" | ")})"
  end

  # True when a non-2xx body looks like an interception page rather than an
  # OpenRouter error. OpenRouter always nests its message under
  # "error" => { "message" => ... }; a top-level "error" String plus one of the
  # BLOCK_MARKERS phrases means something else answered. Kept deliberately narrow
  # so a genuine OpenRouter 403 (e.g. a disabled key) still rolls over normally.
  def blocked_response?(status, body, raw_body)
    return false unless status == 403 || status == 451

    openrouter_shaped =
      begin
        body.is_a?(Hash) && body["error"].is_a?(Hash)
      rescue StandardError
        false
      end
    return false if openrouter_shaped

    haystack = raw_body.to_s.downcase
    BLOCK_MARKERS.any? { |marker| haystack.include?(marker) }
  end

  # OpenRouter's signal for a retired or misspelled model slug:
  #   404 {"error":{"message":"No endpoints found for <slug>.","code":404}}
  def dead_model_response?(status, raw_body)
    status == 404 && raw_body.to_s.downcase.include?("no endpoints found")
  end

  def build_body(model, messages)
    {
      model: model,
      messages: messages,
      # Hardcoded modest cap so the free/low-credit tier's affordability check
      # passes; without it OpenRouter reserves the model's full max output
      # (e.g. 65535) and rejects the request up-front. The output now carries a
      # summary, 3 questions, up to 4 vital_badges, AND medical_terms — and
      # non-Latin scripts (Persian/Sorani) cost several tokens per character, so
      # 2000 truncated the JSON mid-object (the response no longer parsed and the
      # raw blob leaked into the summary). 4000 gives the full structure room.
      max_tokens: 4000,
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
      ],
      "medical_terms" => [
        { "term" => "کم‌خونی فقر آهن", "definition" => "کمبود آهن در بدن که باعث کاهش گلبول‌های قرمز سالم و احساس خستگی می‌شود." },
        { "term" => "هموگلوبین", "definition" => "پروتئینی در گلبول‌های قرمز که وظیفه‌ی حمل اکسیژن در خون را دارد." },
        { "term" => "فریتین", "definition" => "شاخصی که نشان می‌دهد چه مقدار آهن در بدن ذخیره شده است." }
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
      ],
      "medical_terms" => [
        { "term" => "iron-deficiency anemia", "definition" => "Too little iron, so you have fewer healthy red blood cells." },
        { "term" => "hemoglobin", "definition" => "The protein inside red blood cells that carries oxygen around your body." },
        { "term" => "ferritin", "definition" => "A marker that shows how much iron your body has stored." }
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
      ],
      "medical_terms" => [
        { "term" => "کەمخوێنی کەمی ئاسن", "definition" => "کەمی ئاسن لە جەستەدا کە خانە سوورەکانی خوێن کەم دەکاتەوە و هەست بە ماندووبوون دەکەیت." },
        { "term" => "هیمۆگلۆبین", "definition" => "پرۆتیینێک لە خانە سوورەکانی خوێندا کە ئۆکسیجین بۆ جەستە دەگوازێتەوە." },
        { "term" => "فێریتین", "definition" => "پێوەرێک کە نیشان دەدات چەند ئاسن لە جەستەدا هەڵگیراوە." }
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

      # Distinguish "an intermediary blocked us" from "OpenRouter rejected us".
      # Checked before the generic raise so the fallback loop can short-circuit.
      if blocked_response?(response.status, body, raw_body)
        raise UpstreamBlockedError,
              "openrouter_blocked_upstream (HTTP #{response.status} from an intermediary, not OpenRouter)"
      end

      # A retired/misspelled model slug. This is a CONFIG rot bug, not a transient
      # one: it will fail identically on every request until MODELS is edited, and
      # it silently shortens the fallback chain. Logged distinctly so it stands out
      # from real outages — this is exactly how the chain quietly degraded to one
      # working model before 2026-07-29.
      if dead_model_response?(response.status, raw_body)
        Rails.logger.error(
          "[OpenRouterService] MODEL SLUG IS DEAD — OpenRouter has no endpoints for this model. " \
          "Remove or update it in OpenRouterService::MODELS; until then it wastes one " \
          "round-trip per request. Verify with: bin/rails openrouter:verify_models"
        )
      end

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
    # Host-level: every candidate model resolves to this same base URL, so there is
    # nothing for the fallback loop to try.
    raise UpstreamUnreachableError, "openrouter_unreachable"
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

  # Parses the model's text into a normalized
  # { "summary", "questions", "vital_badges", "medical_terms" } hash, tolerating
  # markdown fences or stray prose around the JSON object. If the model returns
  # malformed JSON, we never crash the request.
  def parse_structured(text)
    data =
      begin
        json = extract_json_object(text)
        json ? parse_json_with_repair(json) : {}
      rescue JSON::ParserError => e
        Rails.logger.warn("[OpenRouterService] JSON parse failed, using raw fallback: #{e.message}")
        {}
      rescue StandardError => e
        # Belt-and-braces: a non-ParserError surprise (encoding, deep nesting)
        # must still degrade to an empty structure rather than a 500.
        Rails.logger.warn("[OpenRouterService] unexpected parse failure (#{e.class}: #{e.message}); using raw fallback")
        {}
      end
    data = {} unless data.is_a?(Hash)

    summary = data["summary"].to_s.strip
    questions = Array(data["questions"]).map { |q| q.to_s.strip }.reject(&:blank?)
    vital_badges = normalize_badges(data["vital_badges"])
    medical_terms = reject_unlocatable_terms(normalize_medical_terms(data["medical_terms"]), summary)

    # Fallback: if the model ignored the JSON contract, surface the raw text as
    # the summary so the client still gets something useful — BUT never surface a
    # JSON blob (e.g. a truncated/partial object), otherwise the client would
    # render raw braces and keys on screen. In that case leave summary blank so
    # the UI degrades to an empty state rather than garbage.
    if summary.blank? && questions.empty?
      raw = text.to_s.strip
      summary = raw unless looks_like_json?(raw)
    end

    {
      "summary" => summary,
      "questions" => questions,
      "vital_badges" => vital_badges,
      "medical_terms" => medical_terms
    }
  end

  # True when the text is (the start of) a JSON object/array, ignoring a leading
  # ```json code fence. Used to keep raw JSON out of the human-readable summary.
  def looks_like_json?(text)
    str = text.to_s.strip.sub(/\A```(?:json)?\s*/i, "").strip
    str.start_with?("{", "[")
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

  # Normalizes the model's `medical_terms` into a clean array of
  # { "term", "definition" } hashes. Tolerant of missing keys, non-array input,
  # and non-hash entries; drops any entry missing a term or a definition, and
  # de-duplicates by term (case-insensitive) so the same word isn't decoded
  # twice in the UI.
  def normalize_medical_terms(raw)
    seen = {}
    Array(raw).each_with_object([]) do |t, acc|
      next unless t.is_a?(Hash)

      term = t["term"].to_s.strip
      definition = t["definition"].to_s.strip
      next if term.blank? || definition.blank?

      key = term.downcase
      next if seen[key]

      seen[key] = true
      acc << { "term" => term, "definition" => definition }
    end
  end

  # Parses model JSON, retrying once through a repair pass. Small-model output
  # drifts from strict JSON in two ways we actually observed in the logs:
  #
  #   1. A trailing comma before a closing bracket — this produced the real
  #      "unexpected character: '],' at line 6 column 3" failure on 2026-07-28,
  #      which silently blanked vital_badges and medical_terms.
  #   2. Truncation, when the response hits max_tokens mid-object. extract_json_object
  #      finds no closing "}" for the outermost object, so we close the open
  #      containers ourselves and keep whatever complete fields we already have —
  #      a summary plus two badges beats discarding the whole response.
  #
  # Strict parse is always attempted first, so well-formed output never touches
  # the repair path.
  def parse_json_with_repair(json)
    JSON.parse(json)
  rescue JSON::ParserError => e
    repaired = repair_json(json)
    return JSON.parse(repaired) if repaired.present? && repaired != json

    raise e
  end

  # Conservative textual fixes only — never rewrites values, so it cannot invent
  # clinical data. String-aware, so a comma or brace inside a Persian/Sorani
  # summary is left untouched.
  def repair_json(json)
    str = json.to_s

    # Drop commas that sit immediately before a closing bracket/brace.
    str = strip_trailing_commas(str)

    # Close anything left open by truncation.
    close_open_containers(str)
  end

  # Removes `,` followed only by whitespace then `}` or `]`, ignoring commas that
  # fall inside string literals.
  def strip_trailing_commas(str)
    out = +""
    in_string = false
    escaped = false

    chars = str.chars
    chars.each_with_index do |ch, i|
      if in_string
        out << ch
        if escaped
          escaped = false
        elsif ch == "\\"
          escaped = true
        elsif ch == '"'
          in_string = false
        end
        next
      end

      if ch == '"'
        in_string = true
        out << ch
        next
      end

      if ch == ","
        # Look ahead past whitespace for a closer.
        j = i + 1
        j += 1 while j < chars.length && chars[j].match?(/\s/)
        next if j < chars.length && (chars[j] == "}" || chars[j] == "]")
      end

      out << ch
    end

    out
  end

  # Walks the text tracking container depth outside of strings, then appends the
  # brackets needed to balance it. A dangling partial token (an unterminated
  # string, or a key with no value) is trimmed back to the last structurally safe
  # point first, so the result parses instead of failing a second time.
  def close_open_containers(str)
    stack = []
    in_string = false
    escaped = false
    safe_end = 0

    str.each_char.with_index do |ch, i|
      if in_string
        if escaped
          escaped = false
        elsif ch == "\\"
          escaped = true
        elsif ch == '"'
          in_string = false
          safe_end = i + 1
        end
        next
      end

      case ch
      when '"' then in_string = true
      when "{", "[" then stack.push(ch == "{" ? "}" : "]")
      when "}", "]"
        stack.pop
        safe_end = i + 1
      when ","
        safe_end = i # keep the position BEFORE the comma
      end
    end

    return str if stack.empty? && !in_string

    # Truncated: rewind to the last complete value, then balance the containers.
    trimmed = str[0...safe_end].to_s.sub(/,\s*\z/, "")
    return str if trimmed.blank?

    trimmed + stack.reverse.join
  end

  # Drops terms that do not literally occur in the summary.
  #
  # The client attaches each definition tooltip by locating the term inside the
  # summary text (SymptomForm.vue's summarySegments splits on exactly these
  # strings). A term that is not a substring therefore renders NOTHING — it is not
  # a degraded tooltip, it is an invisible one. Observed 2026-07-29: the model
  # returned English terms lifted from an English lab report while writing its
  # summary in Persian, so all four terms were unlocatable and the whole Jargon
  # Decoder silently disappeared with a 200 OK.
  #
  # Dropping them keeps the payload honest (everything returned is renderable) and
  # the WARN line makes a prompt-compliance regression visible instead of silent.
  def reject_unlocatable_terms(terms, summary)
    return [] if terms.blank?

    haystack = summary.to_s.downcase
    return terms if haystack.blank?

    kept, dropped = terms.partition { |t| haystack.include?(t["term"].to_s.downcase) }

    if dropped.any?
      Rails.logger.warn(
        "[OpenRouterService] dropped #{dropped.size}/#{terms.size} medical_terms not found in the " \
        "summary (no tooltip can render for them): #{dropped.map { |t| t['term'] }.inspect}. " \
        "The model likely lifted terms from the source document instead of copying them out of " \
        "its own summary."
      )
    end

    kept
  end

  def extract_json_object(text)
    str = text.to_s.strip
    str = str.gsub(/\A```(?:json)?\s*/i, "").gsub(/\s*```\z/, "").strip
    start = str.index("{")
    return nil if start.nil?

    finish = str.rindex("}")

    # No closing brace at all → truncated mid-object. Hand the partial text to
    # the repair pass rather than discarding the response outright.
    return str[start..] if finish.nil? || finish < start

    str[start..finish]
  end
end
