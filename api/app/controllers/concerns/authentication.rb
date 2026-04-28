module Authentication
  extend ActiveSupport::Concern

  def current_user
    return @current_user if defined?(@current_user)
    @current_user = lookup_user_from_token
  end

  def authenticate_user!
    render json: { error: "unauthorized" }, status: :unauthorized unless current_user
  end

  private

  def lookup_user_from_token
    header = request.headers["Authorization"]
    return nil if header.blank?

    token = header[/\ABearer\s+(.+)\z/, 1]
    return nil if token.blank?

    User.find_by(api_token: token.strip)
  end
end
