require "rails_helper"

RSpec.describe Doctor do
  subject(:doctor) { build(:doctor) }

  describe "validations" do
    it "is valid with default factory" do
      expect(doctor).to be_valid
    end

    it "requires a name and a specialty" do
      doctor.name = nil
      doctor.specialty = nil
      expect(doctor).to be_invalid
      expect(doctor.errors[:name]).to be_present
      expect(doctor.errors[:specialty]).to be_present
    end

    it "rejects negative experience_years" do
      doctor.experience_years = -1
      expect(doctor).to be_invalid
    end

    it "rejects rating outside 0..5" do
      doctor.rating = -0.1
      expect(doctor).to be_invalid
      doctor.rating = 5.1
      expect(doctor).to be_invalid
    end
  end

  describe ".ranked" do
    it "orders by rating desc then experience desc" do
      sp = create(:specialty)
      mid = create(:doctor, specialty: sp, rating: 4.5, experience_years: 5)
      top = create(:doctor, specialty: sp, rating: 4.9, experience_years: 1)
      tied_more_exp = create(:doctor, specialty: sp, rating: 4.5, experience_years: 20)

      expect(Doctor.ranked.to_a).to eq([top, tied_more_exp, mid])
    end
  end

  describe "#localized_bio" do
    it "returns the right locale" do
      doc = build(:doctor, bio_fa: "زندگی‌نامه", bio_ckb: "ژیاننامە")
      expect(doc.localized_bio("ckb")).to eq("ژیاننامە")
      expect(doc.localized_bio("fa")).to eq("زندگی‌نامه")
    end
  end
end
