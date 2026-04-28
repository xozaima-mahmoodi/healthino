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
