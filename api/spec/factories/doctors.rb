FactoryBot.define do
  factory :doctor do
    sequence(:name) { |n| "Dr. Test #{n}" }
    specialty
    experience_years { 5 }
    rating { 4.0 }
    bio_fa { "پزشک نمونه" }
    bio_ckb { "پزیشکی نموونە" }

    trait :senior do
      experience_years { 20 }
      rating { 4.9 }
    end

    trait :junior do
      experience_years { 1 }
      rating { 3.5 }
    end
  end
end
