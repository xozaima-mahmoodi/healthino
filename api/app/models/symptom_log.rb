class SymptomLog < ApplicationRecord
  belongs_to :user, optional: true
  belongs_to :recommended_specialty, class_name: "Specialty", optional: true

  validates :symptoms, presence: true
  validates :severity, numericality: { in: 1..10 }, allow_nil: true

  scope :red_flagged, -> { where(red_flag: true) }
end
