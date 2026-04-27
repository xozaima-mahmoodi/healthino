module SymptomChecker
  # Coordinates triage: red-flag detection -> specialty match -> doctor ranking.
  class Engine
    Result = Struct.new(:red_flag, :red_flag_reasons, :specialty, :doctors, :symptom_log, keyword_init: true)

    def initialize(symptoms:, severity: nil, body_area: nil, duration_hours: nil, user: nil, locale: "fa")
      @symptoms = Array(symptoms).map(&:to_s).map(&:strip).reject(&:blank?)
      @severity = severity
      @body_area = body_area
      @duration_hours = duration_hours
      @user = user
      @locale = locale
    end

    def call
      flag = RedFlagDetector.new(symptoms: @symptoms, severity: @severity, duration_hours: @duration_hours).call
      specialty = flag.triggered? ? Specialty.find_by(slug: "emergency") : SpecialtyMatcher.new(@symptoms, @body_area).call
      doctors = specialty ? DoctorRanking::Ranker.new(specialty).call : Doctor.none

      log = SymptomLog.create!(
        user: @user,
        symptoms: @symptoms,
        severity: @severity,
        body_area: @body_area,
        duration_hours: @duration_hours,
        recommended_specialty: specialty,
        red_flag: flag.triggered?
      )

      Result.new(
        red_flag: flag.triggered?,
        red_flag_reasons: flag.reasons,
        specialty: specialty,
        doctors: doctors,
        symptom_log: log
      )
    end
  end
end
