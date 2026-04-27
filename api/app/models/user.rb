class User < ApplicationRecord
  has_secure_password validations: false

  has_many :symptom_logs, dependent: :destroy

  SUPPORTED_LOCALES = %w[fa ckb].freeze

  validates :email, presence: true, uniqueness: { case_sensitive: false }
  validates :preferred_locale, inclusion: { in: SUPPORTED_LOCALES }
  validates :age, numericality: { greater_than: 0, less_than: 150 }, allow_nil: true

  before_validation { self.email = email&.downcase&.strip }
end
