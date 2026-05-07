class Assessment < ApplicationRecord
  GENDERS = %w[male female].freeze

  belongs_to :user

  validates :primary_symptom, presence: true
  validates :intensity, numericality: { in: 1..10 }
  validates :gender, inclusion: { in: GENDERS }, allow_nil: true
  validates :age, numericality: { only_integer: true, greater_than: 0, less_than: 150 }, allow_nil: true
  validates :medical_history_details, presence: true, if: :medical_history?
  validates :medication_details, presence: true, if: :medication?

  scope :recent_first, -> { order(created_at: :desc) }
end
