module Api
  module V1
    class SymptomCheckerController < ApplicationController
      include Authentication

      def create
        symptoms = Array(params[:symptoms]).map(&:to_s).map(&:strip).reject(&:blank?)
        if symptoms.empty?
          render json: { errors: { symptoms: ["can't be blank"] } }, status: :unprocessable_content
          return
        end

        locale = params[:locale] || "fa"
        document = document_context

        result = SymptomChecker::Engine.new(
          symptoms: symptoms,
          severity: params[:severity],
          body_area: params[:body_area],
          duration_hours: params[:duration_hours],
          document_summary: document[:summary],
          document_answers: document[:answers],
          user: current_user,
          locale: locale
        ).call

        payload = serialize(result, locale)
        payload[:document_context] = document if document[:summary].present? || document[:answers].any?
        persist_assessment(symptoms, payload) if current_user

        render json: payload
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.as_json }, status: :unprocessable_content
      rescue ActionController::ParameterMissing => e
        render json: { errors: { e.param => ["is required"] } }, status: :unprocessable_content
      rescue StandardError => e
        Rails.logger.error("[SymptomChecker] #{e.class}: #{e.message}")
        Rails.logger.error(e.backtrace.first(20).join("\n")) if e.backtrace
        message = Rails.env.production? ? "internal_error" : "#{e.class}: #{e.message}"
        render json: { errors: { base: [message] } }, status: :internal_server_error
      end

      private

      # Normalizes the document-analysis fields sent alongside the symptom form
      # into { summary:, answers: [{ "question" =>, "answer" => }, ...] }.
      # Tolerates either the structured `document_answers` array or the separate
      # `document_questions` / `user_answers` pair from the client.
      def document_context
        summary = params[:document_summary].presence

        answers =
          if params[:document_answers].present?
            Array(params[:document_answers]).filter_map do |pair|
              p = pair.respond_to?(:to_unsafe_h) ? pair.to_unsafe_h : pair.to_h
              question = p["question"].to_s.strip
              next if question.blank?

              { "question" => question, "answer" => p["answer"].to_s.strip }
            end
          else
            questions = Array(params[:document_questions]).map { |q| q.to_s.strip }
            raw = params[:user_answers]
            raw = raw.to_unsafe_h if raw.respond_to?(:to_unsafe_h)
            raw = raw.is_a?(Hash) ? raw : {}
            questions.each_with_index.filter_map do |question, i|
              next if question.blank?

              answer = (raw[i.to_s] || raw[i]).to_s.strip
              { "question" => question, "answer" => answer }
            end
          end

        { summary: summary, answers: answers }
      end

      def persist_assessment(symptoms, payload)
        primary = symptoms.first
        extras  = symptoms[1..].to_a.join(" ").presence
        intensity = (params[:severity].presence || 5).to_i.clamp(1, 10)

        medical_history = ActiveModel::Type::Boolean.new.cast(params[:medical_history]) || false
        medication      = ActiveModel::Type::Boolean.new.cast(params[:medication]) || false

        current_user.assessments.create!(
          primary_symptom: primary,
          additional_info: extras,
          body_area: params[:body_area].presence,
          intensity: intensity,
          duration_hours: params[:duration_hours].presence&.to_i,
          gender: params[:gender].presence,
          age: params[:age].presence&.to_i,
          medical_history: medical_history,
          medical_history_details: medical_history ? params[:medical_history_details].presence : nil,
          medication: medication,
          medication_details: medication ? params[:medication_details].presence : nil,
          result: payload
        )
      end

      def serialize(result, locale)
        {
          red_flag: result.red_flag,
          red_flag_reasons: result.red_flag_reasons,
          specialty: result.specialty && {
            slug: result.specialty.slug,
            name: result.specialty.localized_name(locale)
          },
          doctors: result.doctors.map { |d|
            {
              id: d.id,
              name: d.name,
              experience_years: d.experience_years,
              rating: d.rating.to_f,
              bio: d.localized_bio(locale)
            }
          },
          symptom_log_id: result.symptom_log.id
        }
      end
    end
  end
end
