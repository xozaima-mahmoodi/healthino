FactoryBot.define do
  factory :assessment do
    user
    primary_symptom { "headache" }
    additional_info { nil }
    body_area { "head" }
    intensity { 5 }
    duration_hours { 6 }
    result { { "specialty" => { "slug" => "neurology", "name" => "مغز و اعصاب" }, "doctors" => [] } }

    trait :severe do
      intensity { 9 }
      result { { "red_flag" => true, "specialty" => { "slug" => "emergency" }, "doctors" => [] } }
    end
  end
end
