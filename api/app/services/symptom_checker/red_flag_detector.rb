module SymptomChecker
  # Placeholder emergency detector. Replace heuristics with a vetted clinical ruleset.
  class RedFlagDetector
    Outcome = Struct.new(:triggered?, :reasons)

    EMERGENCY_KEYWORDS = %w[
      chest_pain shortness_of_breath stroke_symptoms severe_bleeding
      loss_of_consciousness anaphylaxis suicidal_ideation
    ].freeze

    def initialize(symptoms:, severity: nil, duration_hours: nil)
      @symptoms = symptoms.map(&:to_s)
      @severity = severity
      @duration_hours = duration_hours
    end

    def call
      reasons = []
      reasons << "emergency_keyword" if (@symptoms & EMERGENCY_KEYWORDS).any?
      reasons << "high_severity" if @severity.to_i >= 9
      Outcome.new(reasons.any?, reasons)
    end
  end
end
