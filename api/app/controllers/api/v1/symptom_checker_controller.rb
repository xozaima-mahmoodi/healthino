module Api
  module V1
    class SymptomCheckerController < ApplicationController
      def create
        symptoms = Array(params[:symptoms]).map(&:to_s).map(&:strip).reject(&:blank?)
        if symptoms.empty?
          render json: { errors: { symptoms: ["can't be blank"] } }, status: :unprocessable_content
          return
        end

        result = SymptomChecker::Engine.new(
          symptoms: symptoms,
          severity: params[:severity],
          body_area: params[:body_area],
          duration_hours: params[:duration_hours],
          locale: params[:locale] || "fa"
        ).call

        render json: serialize(result, params[:locale] || "fa")
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
