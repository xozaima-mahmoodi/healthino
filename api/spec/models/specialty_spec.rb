require "rails_helper"

RSpec.describe Specialty do
  subject(:specialty) { build(:specialty) }

  describe "validations" do
    it "is valid with default factory" do
      expect(specialty).to be_valid
    end

    it "requires slug, name_fa, name_ckb" do
      specialty.slug = nil
      specialty.name_fa = nil
      specialty.name_ckb = nil
      expect(specialty).to be_invalid
      expect(specialty.errors[:slug]).to be_present
      expect(specialty.errors[:name_fa]).to be_present
      expect(specialty.errors[:name_ckb]).to be_present
    end

    it "enforces unique slug" do
      create(:specialty, slug: "neurology")
      dup = build(:specialty, slug: "neurology")
      expect(dup).to be_invalid
      expect(dup.errors[:slug]).to include("has already been taken")
    end
  end

  describe "associations" do
    it "restricts deletion when doctors exist" do
      sp = create(:specialty)
      create(:doctor, specialty: sp)
      expect(sp.destroy).to be_falsey
      expect(sp.errors[:base].join).to match(/Cannot delete/i)
    end

    it "nullifies recommended_specialty on dependent symptom_logs" do
      sp = create(:specialty)
      log = create(:symptom_log, recommended_specialty: sp)
      sp.destroy
      expect(log.reload.recommended_specialty_id).to be_nil
    end
  end

  describe "#localized_name" do
    it "returns name_ckb for ckb" do
      sp = build(:specialty, name_fa: "پزشک عمومی", name_ckb: "پزیشکی گشتی")
      expect(sp.localized_name("ckb")).to eq("پزیشکی گشتی")
    end

    it "returns name_fa otherwise" do
      sp = build(:specialty, name_fa: "پزشک عمومی", name_ckb: "پزیشکی گشتی")
      expect(sp.localized_name("fa")).to eq("پزشک عمومی")
      expect(sp.localized_name("en")).to eq("پزشک عمومی")
    end
  end
end
