module DoctorRanking
  # Ranks doctors for a specialty. Today: rating + experience. Future: distance, availability, reviews.
  class Ranker
    def initialize(specialty, limit: 5)
      @specialty = specialty
      @limit = limit
    end

    def call
      Doctor.where(specialty: @specialty).ranked.limit(@limit)
    end
  end
end
