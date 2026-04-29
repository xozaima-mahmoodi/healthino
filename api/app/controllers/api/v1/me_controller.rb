module Api
  module V1
    class MeController < ApplicationController
      include Authentication

      before_action :authenticate_user!

      PROFILE_FIELDS = %i[name email preferred_locale].freeze
      PASSWORD_FIELDS = %i[password password_confirmation].freeze

      def show
        render json: { user: serialize(current_user) }
      end

      def update
        profile_attrs  = params.permit(*PROFILE_FIELDS).to_h.compact_blank
        password_attrs = params.permit(*PASSWORD_FIELDS).to_h

        if password_attrs[:password].present?
          if password_attrs[:password] != password_attrs[:password_confirmation]
            return render json: { errors: { password_confirmation: ["doesn't match password"] } },
                          status: :unprocessable_content
          end
          profile_attrs.merge!(password_attrs)
        end

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
