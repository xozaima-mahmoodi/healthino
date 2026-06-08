module Api
  module V1
    class MeController < ApplicationController
      include Authentication

      before_action :authenticate_user!

      PROFILE_FIELDS = %i[name email preferred_locale].freeze

      def show
        render json: { user: serialize(current_user) }
      end

      # Profile metadata only. Password changes go through the dedicated,
      # current-password-verified endpoint (ProfileController#update_password)
      # and are intentionally NOT accepted here.
      def update
        profile_attrs = params.permit(*PROFILE_FIELDS).to_h.compact_blank

        if current_user.update(profile_attrs)
          render json: { user: serialize(current_user) }
        else
          render json: { errors: current_user.errors.as_json },
                 status: :unprocessable_content
        end
      end

      private

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
