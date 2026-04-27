require "rails_helper"

RSpec.describe SymptomChecker::SpecialtyMatcher do
  let!(:general)     { create(:specialty, :general) }
  let!(:neurology)   { create(:specialty, :neurology) }
  let!(:dermatology) { create(:specialty, :dermatology) }
  let!(:pulmonology) { create(:specialty, :pulmonology) }

  it "maps a known symptom to its specialty" do
    result = described_class.new(["headache"]).call
    expect(result).to eq(neurology)
  end

  it "falls back to body_area when no symptom matches" do
    result = described_class.new(["mystery"], "skin").call
    expect(result).to eq(dermatology)
  end

  it "falls back to general when nothing matches" do
    result = described_class.new(["mystery"], "elsewhere").call
    expect(result).to eq(general)
  end

  it "prefers symptom match over body_area when both present" do
    result = described_class.new(["cough"], "skin").call
    expect(result).to eq(pulmonology)
  end
end
