module Api
  module V1
    class AssessmentsController < ApplicationController
      include Authentication

      before_action :authenticate_user!

      def index
        target = resolve_target_user
        return if performed?

        assessments = target.assessments.recent_first

        render json: {
          patient: { id: target.id, name: target.name },
          viewing_as: current_user.id == target.id ? "self" : "doctor",
          assessments: assessments.map { |a| serialize(a) }
        }
      end

      def analyze_document
        file = params[:file]
        unless file.respond_to?(:read)
          # Same {error, message, retryable} shape as every other failure path, so
          # the client can read one contract rather than special-casing this one.
          render json: {
            error: "file_required",
            message: friendly_message("invalid_file", INVALID_FILE_MESSAGE),
            retryable: false
          }, status: :unprocessable_content
          return
        end

        analysis = OpenRouterService.new.analyze_document(file, locale: request_locale)
        render json: {
          summary: analysis["summary"],
          questions: analysis["questions"],
          vital_badges: analysis["vital_badges"],
          medical_terms: analysis["medical_terms"]
        }

      # The AI host is blocked by an intermediary (ISP filter / WAF) or simply
      # unreachable. Nothing about the request is wrong, so this is reported as a
      # retryable outage with its own code — the client can tell the user the
      # service is unreachable rather than implying their document was rejected.
      rescue OpenRouterService::HostLevelError => e
        log_analysis_failure(e)
        render_analysis_error("upstream_blocked", retryable: true, detail: e.message)

      rescue OpenRouterService::ApiError => e
        log_analysis_failure(e)
        render_analysis_error("upstream_unavailable", retryable: true, detail: e.message)

      rescue OpenRouterService::ConfigurationError => e
        # Operator error, not a transient one — retrying will not fix it.
        log_analysis_failure(e)
        render_analysis_error("service_unconfigured", retryable: false, detail: e.message)

      rescue ArgumentError => e
        # Caller's fault (unsupported MIME type, blank file): a 4xx, not an outage.
        Rails.logger.warn("[AssessmentsController] ArgumentError: #{e.message}")
        render json: {
          error: e.message,
          message: friendly_message("invalid_file", INVALID_FILE_MESSAGE),
          retryable: false
        }, status: :unprocessable_content

      rescue StandardError => e
        log_analysis_failure(e)
        render_analysis_error("analysis_failed", retryable: true, detail: "#{e.class}: #{e.message}")
      end

      private

      # Seconds the client should wait before retrying a transient failure. Also
      # emitted as the Retry-After header.
      ANALYSIS_RETRY_AFTER = 30

      # Safety-net copy for clients that don't map the `error` code themselves.
      # Persian, matching the app's default UI locale (OpenRouterService::DEFAULT_LOCALE).
      # See friendly_message below for why these are constants and not translations.
      UPSTREAM_BLOCKED_MESSAGE  = "سرویس هوش مصنوعی در دسترس نیست. لطفاً چند لحظه بعد دوباره تلاش کنید."
      UPSTREAM_UNAVAILABLE_MESSAGE = "تحلیل مدارک موقتاً امکان‌پذیر نیست. لطفاً دوباره تلاش کنید."
      SERVICE_UNCONFIGURED_MESSAGE = "سرویس تحلیل هوشمند پیکربندی نشده است. با پشتیبانی تماس بگیرید."
      ANALYSIS_FAILED_MESSAGE   = "تحلیل مدارک با خطا مواجه شد. لطفاً دوباره تلاش کنید."
      INVALID_FILE_MESSAGE      = "فایل ارسالی پشتیبانی نمی‌شود. یک تصویر یا PDF بارگذاری کنید."

      FRIENDLY_MESSAGES = {
        "upstream_blocked"      => UPSTREAM_BLOCKED_MESSAGE,
        "upstream_unavailable"  => UPSTREAM_UNAVAILABLE_MESSAGE,
        "service_unconfigured"  => SERVICE_UNCONFIGURED_MESSAGE,
        "analysis_failed"       => ANALYSIS_FAILED_MESSAGE,
        "invalid_file"          => INVALID_FILE_MESSAGE
      }.freeze

      # Renders a 503 that is always well-formed JSON. Every failure path carries a
      # stable machine `code` for the frontend to branch on, plus human copy in the
      # patient's language. `detail` is the raw internal reason — useful in
      # development, withheld in production so upstream internals never leak.
      def render_analysis_error(code, retryable:, detail: nil)
        response.headers["Retry-After"] = ANALYSIS_RETRY_AFTER.to_s if retryable

        payload = {
          error: code,
          message: friendly_message(code, ANALYSIS_FAILED_MESSAGE),
          retryable: retryable
        }
        payload[:retry_after] = ANALYSIS_RETRY_AFTER if retryable
        payload[:detail] = detail if detail.present? && !Rails.env.production?

        render json: payload, status: :service_unavailable
      end

      # Patient-facing fallback copy for an error code.
      #
      # Deliberately NOT an I18n lookup. This API registers only `en`
      # (I18n.available_locales == [:en]); every patient-facing string for
      # fa / ckb / en lives in the frontend bundle (web/src/locales/*.json), so
      # the localization point is the client, not here. Passing locale: "fa" to
      # I18n.t raises I18n::InvalidLocale.
      #
      # The contract is therefore: the client branches on the stable `error` code
      # and renders its own localized copy; this string is only the safety net for
      # a client that doesn't recognize the code. Persian is the app's default UI
      # language, so the net is written in Persian.
      def friendly_message(code, fallback)
        FRIENDLY_MESSAGES.fetch(code, fallback)
      end

      def log_analysis_failure(error)
        Rails.logger.error("[AssessmentsController] analyze_document failed — #{error.class}: #{error.message}")
        Rails.logger.error(error.backtrace.first(20).join("\n")) if error.backtrace
      end

      # Locale the document analysis should be written in. Prefers an explicit
      # `locale` param (sent by the client), then the Accept-Language header.
      def request_locale
        params[:locale].presence ||
          request.headers["Accept-Language"].to_s.split(",").first
      end

      def resolve_target_user
        requested_id = params[:user_id].presence&.to_i
        return current_user if requested_id.nil? || requested_id == current_user.id

        unless current_user.doctor?
          render json: { error: "forbidden" }, status: :forbidden
          return nil
        end

        User.find_by(id: requested_id) || begin
          render json: { error: "not_found" }, status: :not_found
          nil
        end
      end

      def serialize(a)
        {
          id: a.id,
          primary_symptom: a.primary_symptom,
          additional_info: a.additional_info,
          body_area: a.body_area,
          intensity: a.intensity,
          duration_hours: a.duration_hours,
          result: a.result,
          created_at: a.created_at.iso8601
        }
      end
    end
  end
end
