FactoryBot.define do
  factory :specialty do
    sequence(:slug) { |n| "specialty-#{n}" }
    name_fa { "تخصص" }
    name_ckb { "پسپۆڕی" }
    description_fa { nil }
    description_ckb { nil }

    trait :general     do; slug { "general" };          name_fa { "پزشک عمومی" };  name_ckb { "پزیشکی گشتی" } end
    trait :emergency   do; slug { "emergency" };        name_fa { "اورژانس" };     name_ckb { "فریاگوزاری" } end
    trait :neurology   do; slug { "neurology" };        name_fa { "مغز و اعصاب" }; name_ckb { "نۆرۆلۆجی" } end
    trait :dermatology do; slug { "dermatology" };      name_fa { "پوست" };        name_ckb { "پێست" } end
    trait :pulmonology do; slug { "pulmonology" };      name_fa { "ریه" };         name_ckb { "سی" } end
    trait :gi          do; slug { "gastroenterology" }; name_fa { "گوارش" };       name_ckb { "گەدە و ڕیخۆڵە" } end
  end
end
