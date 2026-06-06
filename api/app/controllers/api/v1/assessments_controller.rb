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
          render json: { error: "file_required" }, status: :unprocessable_content
          return
        end

        summary = GeminiService.new.analyze_document(file)
        render json: { summary: summary }
      rescue GeminiService::ConfigurationError => e
        Rails.logger.error("[GeminiService] #{e.message}")
        render json: { error: "service_unconfigured" }, status: :service_unavailable
      rescue ArgumentError => e
        render json: { error: e.message }, status: :unprocessable_content
      rescue StandardError => e
        Rails.logger.error("[GeminiService] #{e.class}: #{e.message}")
        Rails.logger.error(e.backtrace.first(20).join("\n")) if e.backtrace
        message = Rails.env.production? ? "analysis_failed" : "#{e.class}: #{e.message}"
        render json: { error: message }, status: :bad_gateway
      end

      private

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
