require "rails_helper"

RSpec.describe SymptomLog do
  describe "validations" do
    it "is valid without a user (anonymous triage)" do
      log = build(:symptom_log, user: nil)
      expect(log).to be_valid
    end

    it "is valid with a user" do
      log = build(:symptom_log, user: build(:user))
      expect(log).to be_valid
    end

    it "requires symptoms" do
      log = build(:symptom_log, symptoms: [])
      expect(log).to be_invalid
      expect(log.errors[:symptoms]).to be_present
    end

    it "rejects severity outside 1..10" do
      log = build(:symptom_log, severity: 0)
      expect(log).to be_invalid
      log.severity = 11
      expect(log).to be_invalid
    end

    it "allows nil severity" do
      log = build(:symptom_log, severity: nil)
      expect(log).to be_valid
    end
  end

  describe "associations" do
    it "links to user (optional)" do
      assoc = described_class.reflect_on_association(:user)
      expect(assoc.macro).to eq(:belongs_to)
      expect(assoc.options[:optional]).to be true
    end

    it "links to recommended specialty (optional)" do
      assoc = described_class.reflect_on_association(:recommended_specialty)
      expect(assoc.macro).to eq(:belongs_to)
      expect(assoc.class_name).to eq("Specialty")
      expect(assoc.options[:optional]).to be true
    end
  end

  describe ".red_flagged" do
    it "returns only red-flagged logs" do
      flagged = create(:symptom_log, :red_flagged)
      _normal = create(:symptom_log)
      expect(SymptomLog.red_flagged.to_a).to eq([flagged])
    end
  end
end
