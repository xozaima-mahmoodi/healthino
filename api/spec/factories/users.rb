FactoryBot.define do
  factory :user do
    name { "Test Patient" }
    sequence(:email) { |n| "patient#{n}@healthino.test" }
    password { "secret123" }
    age { 30 }
    gender { "female" }
    chronic_conditions { [] }
    preferred_locale { "fa" }
  end
end
