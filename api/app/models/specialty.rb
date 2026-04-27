class Specialty < ApplicationRecord
  has_many :doctors, dependent: :restrict_with_error
  has_many :symptom_logs, foreign_key: :recommended_specialty_id, dependent: :nullify

  validates :slug, presence: true, uniqueness: true
  validates :name_fa, :name_ckb, presence: true

  def localized_name(locale)
    locale.to_s == "ckb" ? name_ckb : name_fa
  end
end
