require "rails_helper"

RSpec.describe SymptomChecker::Engine do
  let!(:general)   { create(:specialty, :general) }
  let!(:emergency) { create(:specialty, :emergency) }
  let!(:neurology) { create(:specialty, :neurology) }

  let!(:neuro_top)    { create(:doctor, specialty: neurology, rating: 4.9, experience_years: 10) }
  let!(:neuro_mid)    { create(:doctor, specialty: neurology, rating: 4.0, experience_years: 12) }
  let!(:er_doc)       { create(:doctor, specialty: emergency, rating: 4.8, experience_years: 20) }

  describe "normal triage" do
    subject(:result) do
      described_class.new(symptoms: ["headache"], severity: 4, body_area: "head", duration_hours: 8).call
    end

    it "is not red-flagged" do
      expect(result.red_flag).to be false
      expect(result.red_flag_reasons).to be_empty
    end

    it "matches the specialty" do
      expect(result.specialty).to eq(neurology)
    end

    it "returns ranked doctors for that specialty" do
      expect(result.doctors).to eq([neuro_top, neuro_mid])
    end

    it "persists a SymptomLog with the recommendation" do
      expect { result }.to change(SymptomLog, :count).by(1)
      log = result.symptom_log
      expect(log.symptoms).to eq(["headache"])
      expect(log.recommended_specialty).to eq(neurology)
      expect(log.red_flag).to be false
    end
  end

  describe "red-flag flow" do
    subject(:result) do
      described_class.new(symptoms: ["chest_pain"], severity: 9).call
    end

    it "flags as emergency and routes to emergency specialty" do
      expect(result.red_flag).to be true
      expect(result.red_flag_reasons).to include("emergency_keyword", "high_severity")
      expect(result.specialty).to eq(emergency)
      expect(result.doctors).to eq([er_doc])
    end

    it "persists the log with red_flag: true" do
      log = result.symptom_log
      expect(log.red_flag).to be true
      expect(log.recommended_specialty).to eq(emergency)
    end
  end

  describe "input normalization" do
    it "strips whitespace and rejects blanks in symptoms" do
      result = described_class.new(symptoms: ["  headache  ", "", nil]).call
      expect(result.symptom_log.symptoms).to eq(["headache"])
    end
  end

  describe "associating to a user" do
    it "links the symptom log to the user when given" do
      patient = create(:user)
      result = described_class.new(symptoms: ["headache"], user: patient).call
      expect(result.symptom_log.user).to eq(patient)
    end
  end
end
