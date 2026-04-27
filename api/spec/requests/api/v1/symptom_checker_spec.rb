require "rails_helper"

RSpec.describe "POST /api/v1/symptom_checker" do
  let!(:general)   { create(:specialty, :general) }
  let!(:emergency) { create(:specialty, :emergency) }
  let!(:neurology) { create(:specialty, :neurology) }
  let!(:neuro_doc) { create(:doctor, specialty: neurology, rating: 4.7, experience_years: 8) }
  let!(:er_doc)    { create(:doctor, specialty: emergency, rating: 4.9, experience_years: 20) }

  let(:headers) { { "Content-Type" => "application/json", "Accept" => "application/json" } }

  context "with normal symptoms" do
    let(:payload) do
      { symptoms: ["headache"], severity: 4, body_area: "head", duration_hours: 8, locale: "fa" }
    end

    it "returns 200 with the localized recommendation" do
      post "/api/v1/symptom_checker", params: payload.to_json, headers: headers
      expect(response).to have_http_status(:ok)

      body = JSON.parse(response.body)
      expect(body["red_flag"]).to be false
      expect(body["red_flag_reasons"]).to eq([])
      expect(body["specialty"]).to include("slug" => "neurology")
      expect(body["specialty"]["name"]).to eq("مغز و اعصاب")
      expect(body["doctors"].first).to include("name" => neuro_doc.name, "rating" => 4.7)
      expect(body["symptom_log_id"]).to be_a(Integer)
    end

    it "persists a non-flagged SymptomLog" do
      expect {
        post "/api/v1/symptom_checker", params: payload.to_json, headers: headers
      }.to change(SymptomLog, :count).by(1)
      expect(SymptomLog.last.red_flag).to be false
    end
  end

  context "with red-flag symptoms" do
    let(:payload) { { symptoms: ["chest_pain"], severity: 9, locale: "ckb" } }

    it "returns the emergency specialty in Sorani" do
      post "/api/v1/symptom_checker", params: payload.to_json, headers: headers
      body = JSON.parse(response.body)

      expect(response).to have_http_status(:ok)
      expect(body["red_flag"]).to be true
      expect(body["red_flag_reasons"]).to include("emergency_keyword", "high_severity")
      expect(body["specialty"]).to include("slug" => "emergency")
      expect(body["specialty"]["name"]).to eq("فریاگوزاری")
      expect(body["doctors"].first["name"]).to eq(er_doc.name)
    end

    it "persists a flagged SymptomLog" do
      post "/api/v1/symptom_checker", params: payload.to_json, headers: headers
      expect(SymptomLog.last.red_flag).to be true
      expect(SymptomLog.last.recommended_specialty).to eq(emergency)
    end
  end

  context "with invalid input" do
    it "returns 422 when symptoms are missing" do
      post "/api/v1/symptom_checker", params: { symptoms: [] }.to_json, headers: headers
      expect(response).to have_http_status(:unprocessable_content)
      body = JSON.parse(response.body)
      expect(body).to have_key("errors")
    end

    it "returns 422 when symptoms key is absent" do
      post "/api/v1/symptom_checker", params: {}.to_json, headers: headers
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "does not persist a SymptomLog on invalid input" do
      expect {
        post "/api/v1/symptom_checker", params: { symptoms: [] }.to_json, headers: headers
      }.not_to change(SymptomLog, :count)
    end
  end

  context "locale fallback" do
    it "defaults to fa when locale is omitted" do
      post "/api/v1/symptom_checker", params: { symptoms: ["headache"] }.to_json, headers: headers
      body = JSON.parse(response.body)
      expect(body["specialty"]["name"]).to eq("مغز و اعصاب")
    end
  end
end
