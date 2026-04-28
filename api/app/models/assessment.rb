class Assessment < ApplicationRecord
  belongs_to :user

  validates :primary_symptom, presence: true
  validates :intensity, numericality: { in: 1..10 }

  scope :recent_first, -> { order(created_at: :desc) }
end
