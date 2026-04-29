class User < ApplicationRecord
  has_secure_password validations: false

  has_many :symptom_logs, dependent: :destroy
  has_many :assessments, dependent: :destroy

  SUPPORTED_LOCALES = %w[fa ckb].freeze

  validates :email, presence: true, uniqueness: { case_sensitive: false },
                    format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :preferred_locale, inclusion: { in: SUPPORTED_LOCALES }
  validates :age, numericality: { greater_than: 0, less_than: 150 }, allow_nil: true
  validates :api_token, presence: true, uniqueness: true
  validates :name, presence: true, on: :create
  validates :password, length: { minimum: 6 }, allow_blank: true

  def display_name
    name.presence || email.split("@", 2).first
  end

  EMAIL_INVISIBLE_CHARS = /[ ​-‏‪-‮⁠﻿]/

  before_validation :sanitize_email
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

  def sanitize_email
    return if email.blank?
    self.email = email.gsub(EMAIL_INVISIBLE_CHARS, "").strip.downcase
  end

  def ensure_api_token
    self.api_token ||= self.class.generate_api_token
  end
end
