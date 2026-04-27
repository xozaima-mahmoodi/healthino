require "rails_helper"

RSpec.describe SymptomChecker::RedFlagDetector do
  def detect(symptoms:, severity: nil, duration_hours: nil)
    described_class.new(symptoms: symptoms, severity: severity, duration_hours: duration_hours).call
  end

  it "is not triggered for benign symptoms" do
    outcome = detect(symptoms: ["headache"], severity: 3)
    expect(outcome.triggered?).to be false
    expect(outcome.reasons).to be_empty
  end

  it "triggers on emergency keywords" do
    outcome = detect(symptoms: ["chest_pain"], severity: 4)
    expect(outcome.triggered?).to be true
    expect(outcome.reasons).to include("emergency_keyword")
  end

  it "triggers on high severity (>= 9)" do
    outcome = detect(symptoms: ["headache"], severity: 9)
    expect(outcome.triggered?).to be true
    expect(outcome.reasons).to include("high_severity")
  end

  it "stacks reasons when both fire" do
    outcome = detect(symptoms: ["chest_pain"], severity: 10)
    expect(outcome.reasons).to contain_exactly("emergency_keyword", "high_severity")
  end

  it "treats nil severity as zero" do
    outcome = detect(symptoms: ["headache"])
    expect(outcome.triggered?).to be false
  end
end
