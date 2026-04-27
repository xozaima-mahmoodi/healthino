module SymptomChecker
  # Naive keyword -> specialty mapping. Replace with a learned model or rules engine.
  class SpecialtyMatcher
    SYMPTOM_TO_SLUG = {
      "headache" => "neurology",
      "migraine" => "neurology",
      "rash" => "dermatology",
      "acne" => "dermatology",
      "cough" => "pulmonology",
      "fever" => "general",
      "stomach_pain" => "gastroenterology",
      "nausea" => "gastroenterology",
      "joint_pain" => "orthopedics",
      "anxiety" => "psychiatry",
      "depression" => "psychiatry"
    }.freeze

    BODY_AREA_TO_SLUG = {
      "head" => "neurology",
      "skin" => "dermatology",
      "chest" => "pulmonology",
      "abdomen" => "gastroenterology",
      "joints" => "orthopedics"
    }.freeze

    def initialize(symptoms, body_area = nil)
      @symptoms = symptoms.map(&:to_s)
      @body_area = body_area.to_s
    end

    def call
      slug = @symptoms.lazy.map { SYMPTOM_TO_SLUG[_1] }.find(&:present?)
      slug ||= BODY_AREA_TO_SLUG[@body_area]
      Specialty.find_by(slug: slug || "general")
    end
  end
end
