module Api
  module V1
    class AuthController < ApplicationController
      def register
        password = params[:password].to_s
        if password.length < 6
          return render json: { errors: { password: ["must be at least 6 characters"] } },
                        status: :unprocessable_content
        end

        user = User.new(
          name: params[:name],
          email: params[:email],
          preferred_locale: params[:preferred_locale].presence || "fa",
          age: params[:age].presence,
          gender: params[:gender].presence,
          password: password
        )

        if user.save
          render json: { token: user.api_token, user: user_payload(user) }, status: :created
        else
          render json: { errors: user.errors.as_json }, status: :unprocessable_content
        end
      end

      def login
        email = params[:email].to_s.downcase.strip
        user = User.find_by(email: email)

        if user&.authenticate(params[:password].to_s)
          render json: { token: user.api_token, user: user_payload(user) }
        else
          render json: { errors: { base: ["invalid_credentials"] } }, status: :unauthorized
        end
      end

      private

      def user_payload(u)
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
