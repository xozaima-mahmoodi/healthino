module Api
  module V1
    class MeController < ApplicationController
      include Authentication

      before_action :authenticate_user!

      def show
        render json: { user: serialize(current_user) }
      end

      private

      def serialize(u)
        {
          id: u.id,
          name: u.name,
          display_name: u.display_name,
          email: u.email,
          preferred_locale: u.preferred_locale,
          is_doctor: u.is_doctor
        }
      end
    end
  end
end
