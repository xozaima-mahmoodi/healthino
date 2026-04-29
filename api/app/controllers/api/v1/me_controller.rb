module Api
  module V1
    class MeController < ApplicationController
      include Authentication

      before_action :authenticate_user!

      ALLOWED_UPDATE_FIELDS = %i[name email preferred_locale].freeze

      def show
        render json: { user: serialize(current_user) }
      end

      def update
        attrs = update_params
        if current_user.update(attrs)
          render json: { user: serialize(current_user) }
        else
          render json: { errors: current_user.errors.as_json },
                 status: :unprocessable_content
        end
      end

      private

      def update_params
        permitted = params.permit(*ALLOWED_UPDATE_FIELDS).to_h
        permitted.compact_blank
      end

      def serialize(u)
        {
          id: u.id,
          name: u.name,
          display_name: u.display_name,
          email: u.email,
          preferred_locale: u.preferred_locale,
          is_doctor: u.is_doctor,
          created_at: u.created_at
        }
      end
    end
  end
end
