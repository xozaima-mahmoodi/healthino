require "rails_helper"

RSpec.describe Assessment do
  describe "validations" do
    it "is valid with the factory defaults" do
      expect(build(:assessment)).to be_valid
    end

    it "requires a primary_symptom" do
      a = build(:assessment, primary_symptom: nil)
      expect(a).to be_invalid
      expect(a.errors[:primary_symptom]).to be_present
    end

    it "rejects intensity outside 1..10" do
      expect(build(:assessment, intensity: 0)).to be_invalid
      expect(build(:assessment, intensity: 11)).to be_invalid
    end

    describe "gender" do
      it "is optional" do
        expect(build(:assessment, gender: nil)).to be_valid
      end

      it "accepts only male and female" do
        %w[male female].each do |g|
          expect(build(:assessment, gender: g)).to be_valid
        end
      end

      it "rejects unrecognised values (including 'other')" do
        expect(build(:assessment, gender: "other")).to be_invalid
        expect(build(:assessment, gender: "robot")).to be_invalid
      end
    end

    describe "age" do
      it "is optional" do
        expect(build(:assessment, age: nil)).to be_valid
      end

      it "rejects zero, negative, and absurdly large values" do
        expect(build(:assessment, age: 0)).to be_invalid
        expect(build(:assessment, age: -1)).to be_invalid
        expect(build(:assessment, age: 200)).to be_invalid
      end
    end

    describe "medical_history" do
      it "requires medical_history_details when flag is true" do
        a = build(:assessment, medical_history: true, medical_history_details: nil)
        expect(a).to be_invalid
        expect(a.errors[:medical_history_details]).to be_present
      end

      it "does not require details when flag is false" do
        a = build(:assessment, medical_history: false, medical_history_details: nil)
        expect(a).to be_valid
      end
    end

    describe "medication" do
      it "requires medication_details when flag is true" do
        a = build(:assessment, medication: true, medication_details: nil)
        expect(a).to be_invalid
        expect(a.errors[:medication_details]).to be_present
      end

      it "does not require details when flag is false" do
        a = build(:assessment, medication: false, medication_details: nil)
        expect(a).to be_valid
      end
    end
  end
end
