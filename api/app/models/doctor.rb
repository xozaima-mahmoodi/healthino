class Doctor < ApplicationRecord
  belongs_to :specialty

  validates :name, presence: true
  validates :experience_years, numericality: { greater_than_or_equal_to: 0 }
  validates :rating, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 5 }

  scope :ranked, -> { order(rating: :desc, experience_years: :desc) }

  def localized_bio(locale)
    locale.to_s == "ckb" ? bio_ckb : bio_fa
  end
end
