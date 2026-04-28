class User < ApplicationRecord
  has_secure_password validations: false

  has_many :symptom_logs, dependent: :destroy
  has_many :assessments, dependent: :destroy

  SUPPORTED_LOCALES = %w[fa ckb].freeze

  validates :email, presence: true, uniqueness: { case_sensitive: false }
  validates :preferred_locale, inclusion: { in: SUPPORTED_LOCALES }
  validates :age, numericality: { greater_than: 0, less_than: 150 }, allow_nil: true
  validates :api_token, presence: true, uniqueness: true

  before_validation { self.email = email&.downcase&.strip }
  before_validation :ensure_api_token

  def doctor?
    is_doctor
  end

  def regenerate_api_token!
    update!(api_token: self.class.generate_api_token)
  end

  def self.generate_api_token
    loop do
      token = SecureRandom.hex(24)
      break token unless exists?(api_token: token)
    end
  end

  private

  def ensure_api_token
    self.api_token ||= self.class.generate_api_token
  end
end
