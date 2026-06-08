module Api
  module V1
    # Dedicated, security-sensitive profile operations that must not ride along
    # with the generic profile PATCH (me#update). Changing a password requires
    # proving knowledge of the *current* password, so it lives on its own
    # endpoint where that check is mandatory.
    class ProfileController < ApplicationController
      include Authentication

      before_action :authenticate_user!

      # PUT /api/v1/profile/update_password
      def update_password
        current_password = params[:current_password].to_s
        new_password     = params[:password].to_s
        confirmation     = params[:password_confirmation].to_s

        # 1. Prove the requester actually knows the current password. A valid
        #    bearer token alone must never be enough to rotate credentials.
        unless current_user.authenticate(current_password)
          return render json: { errors: { current_password: ["is incorrect"] } },
                        status: :unauthorized
        end

        # 2. The new password and its confirmation must agree.
        if new_password != confirmation
          return render json: { errors: { password_confirmation: ["doesn't match password"] } },
                        status: :unprocessable_content
        end

        # 3. Enforce the strength policy server-side — never trust the client.
        unless strong_password?(new_password)
          return render json: { errors: { password: ["must be at least 8 characters and include a number and a special character"] } },
                        status: :unprocessable_content
        end

        # 4. Persist via has_secure_password (sets password_digest). Model-level
        #    validations still run and surface as 422 if anything else is off.
        if current_user.update(password: new_password, password_confirmation: confirmation)
          render json: { message: "password_updated", user: serialize(current_user) }
        else
          render json: { errors: current_user.errors.as_json },
                 status: :unprocessable_content
        end
      end

      private

      def strong_password?(pw)
        pw.length >= 8 && pw.match?(/\d/) && pw.match?(/[^A-Za-z0-9]/)
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
