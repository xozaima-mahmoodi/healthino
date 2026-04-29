module Api
  module V1
    class SymptomCheckerController < ApplicationController
      include Authentication

      def create
        symptoms = Array(params[:symptoms]).map(&:to_s).map(&:strip).reject(&:blank?)
        if symptoms.empty?
          render json: { errors: { symptoms: ["can't be blank"] } }, status: :unprocessable_content
          return
        end

        locale = params[:locale] || "fa"

        result = SymptomChecker::Engine.new(
          symptoms: symptoms,
          severity: params[:severity],
          body_area: params[:body_area],
          duration_hours: params[:duration_hours],
          user: current_user,
          locale: locale
        ).call

        payload = serialize(result, locale)
        persist_assessment(symptoms, payload) if current_user

        render json: payload
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.as_json }, status: :unprocessable_content
      rescue ActionController::ParameterMissing => e
        render json: { errors: { e.param => ["is required"] } }, status: :unprocessable_content
      rescue StandardError => e
        Rails.logger.error("[SymptomChecker] #{e.class}: #{e.message}")
        Rails.logger.error(e.backtrace.first(20).join("\n")) if e.backtrace
        message = Rails.env.production? ? "internal_error" : "#{e.class}: #{e.message}"
        render json: { errors: { base: [message] } }, status: :internal_server_error
      end

      private

      def persist_assessment(symptoms, payload)
        primary = symptoms.first
        extras  = symptoms[1..].to_a.join(" ").presence
        intensity = (params[:severity].presence || 5).to_i.clamp(1, 10)

        current_user.assessments.create!(
          primary_symptom: primary,
          additional_info: extras,
          body_area: params[:body_area].presence,
          intensity: intensity,
          duration_hours: params[:duration_hours].presence&.to_i,
          result: payload
        )
      end

      def serialize(result, locale)
        {
          red_flag: result.red_flag,
          red_flag_reasons: result.red_flag_reasons,
          specialty: result.specialty && {
            slug: result.specialty.slug,
            name: result.specialty.localized_name(locale)
          },
          doctors: result.doctors.map { |d|
            {
              id: d.id,
              name: d.name,
              experience_years: d.experience_years,
              rating: d.rating.to_f,
              bio: d.localized_bio(locale)
            }
          },
          symptom_log_id: result.symptom_log.id
        }
      end
    end
  end
end
