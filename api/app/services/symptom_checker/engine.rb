module SymptomChecker
  # Coordinates triage: red-flag detection -> specialty match -> doctor ranking.
  class Engine
    Result = Struct.new(:red_flag, :red_flag_reasons, :specialty, :doctors, :symptom_log, :document_context, keyword_init: true)

    def initialize(symptoms:, severity: nil, body_area: nil, duration_hours: nil,
                   document_summary: nil, document_answers: [], user: nil, locale: "fa")
      @symptoms = Array(symptoms).map(&:to_s).map(&:strip).reject(&:blank?)
      @severity = severity
      @body_area = body_area
      @duration_hours = duration_hours
      @document_summary = document_summary.presence
      @document_answers = Array(document_answers)
      @user = user
      @locale = locale
    end

    def call
      # Fold the document findings and the patient's follow-up answers into the
      # signal pool so triage considers them alongside the reported symptoms.
      signals = @symptoms + document_signals

      flag = RedFlagDetector.new(symptoms: signals, severity: @severity, duration_hours: @duration_hours).call
      specialty = flag.triggered? ? Specialty.find_by(slug: "emergency") : SpecialtyMatcher.new(signals, @body_area).call
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
        symptom_log: log,
        document_context: document_context
      )
    end

    private

    # Free-text tokens extracted from the document summary and follow-up answers,
    # available to the (placeholder) keyword-based detector/matcher.
    def document_signals
      text = [@document_summary, *@document_answers.map { |a| a["answer"] || a[:answer] }].compact.join(" ")
      text.downcase.scan(/[a-z_]+/).uniq
    end

    def document_context
      return nil if @document_summary.blank? && @document_answers.empty?

      { "summary" => @document_summary, "answers" => @document_answers }
    end
  end
end
