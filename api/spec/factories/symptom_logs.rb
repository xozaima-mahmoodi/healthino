FactoryBot.define do
  factory :symptom_log do
    user { nil }
    symptoms { ["headache"] }
    severity { 4 }
    body_area { "head" }
    duration_hours { 6 }
    recommended_specialty { nil }
    red_flag { false }

    trait :red_flagged do
      red_flag { true }
      symptoms { ["chest_pain"] }
      severity { 9 }
    end
  end
end
