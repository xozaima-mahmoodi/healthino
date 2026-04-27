require "rails_helper"

RSpec.describe User do
  subject(:user) { build(:user) }

  describe "validations" do
    it "is valid with default factory" do
      expect(user).to be_valid
    end

    it "requires an email" do
      user.email = nil
      expect(user).to be_invalid
      expect(user.errors[:email]).to include("can't be blank")
    end

    it "enforces case-insensitive email uniqueness" do
      create(:user, email: "Patient@example.com")
      duplicate = build(:user, email: "patient@EXAMPLE.com")
      expect(duplicate).to be_invalid
      expect(duplicate.errors[:email]).to include("has already been taken")
    end

    it "downcases and strips email before validation" do
      user.email = "  Mixed@Case.IO  "
      user.valid?
      expect(user.email).to eq("mixed@case.io")
    end

    it "rejects unsupported locales" do
      user.preferred_locale = "en"
      expect(user).to be_invalid
      expect(user.errors[:preferred_locale]).to be_present
    end

    it "accepts fa and ckb" do
      %w[fa ckb].each do |loc|
        user.preferred_locale = loc
        expect(user).to be_valid, "expected locale #{loc} to be valid"
      end
    end

    it "rejects out-of-range age" do
      user.age = 0
      expect(user).to be_invalid
      user.age = 200
      expect(user).to be_invalid
    end

    it "allows nil age" do
      user.age = nil
      expect(user).to be_valid
    end
  end

  describe "associations" do
    it "destroys symptom logs when user is deleted" do
      saved = create(:user)
      create(:symptom_log, user: saved)
      expect { saved.destroy }.to change(SymptomLog, :count).by(-1)
    end
  end

  describe "secure password" do
    it "stores a digest, not plaintext" do
      saved = create(:user, password: "supersecret")
      expect(saved.password_digest).to be_present
      expect(saved.password_digest).not_to eq("supersecret")
      expect(saved.authenticate("supersecret")).to be_truthy
      expect(saved.authenticate("wrong")).to be_falsey
    end
  end
end
