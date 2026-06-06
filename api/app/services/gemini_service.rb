require "base64"

class GeminiService
  class ConfigurationError < StandardError; end

  DEFAULT_PROMPT = "Identify the document type and extract key medical findings briefly."
  DEFAULT_MODEL  = "gemini-1.5-pro-latest"
  SUPPORTED_MIME = ->(m) { m.to_s.start_with?("image/") || m.to_s == "application/pdf" }

  def initialize(api_key: nil, model: DEFAULT_MODEL)
    @api_key = api_key ||
               Rails.application.credentials.dig(:gemini, :api_key) ||
               ENV["GEMINI_API_KEY"]
    raise ConfigurationError, "GEMINI_API_KEY is not configured" if @api_key.blank?
    @model = model
  end

  def analyze_document(file, prompt: DEFAULT_PROMPT)
    raise ArgumentError, "file is required" if file.blank?

    mime = file.respond_to?(:content_type) ? file.content_type.to_s : "application/octet-stream"
    raise ArgumentError, "unsupported_mime_type: #{mime}" unless SUPPORTED_MIME.call(mime)

    file.rewind if file.respond_to?(:rewind)
    encoded = Base64.strict_encode64(file.read.to_s)

    response = client.generate_content(
      contents: { role: "user", parts: [
        { text: prompt },
        { inline_data: { mime_type: mime, data: encoded } }
      ] }
    )

    extract_text(response)
  end

  private

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
end
