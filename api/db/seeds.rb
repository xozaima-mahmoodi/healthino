specialties = [
  { slug: "general",          name_fa: "پزشک عمومی",    name_ckb: "پزیشکی گشتی" },
  { slug: "emergency",        name_fa: "اورژانس",        name_ckb: "فریاگوزاری" },
  { slug: "neurology",        name_fa: "مغز و اعصاب",   name_ckb: "نۆرۆلۆجی" },
  { slug: "dermatology",      name_fa: "پوست",           name_ckb: "پێست" },
  { slug: "pulmonology",      name_fa: "ریه",            name_ckb: "سی" },
  { slug: "gastroenterology", name_fa: "گوارش",          name_ckb: "گەدە و ڕیخۆڵە" },
  { slug: "orthopedics",      name_fa: "ارتوپدی",        name_ckb: "ئۆرتۆپیدی" },
  { slug: "psychiatry",       name_fa: "روانپزشکی",     name_ckb: "دەروونناسی" }
]

specialties.each { |attrs| Specialty.find_or_create_by!(slug: attrs[:slug]) { _1.assign_attributes(attrs) } }

sample_doctors = {
  "general"          => [["Dr. Sara Ahmadi", 12, 4.7], ["Dr. Karwan Hassan", 8, 4.5]],
  "neurology"        => [["Dr. Leyla Rahimi", 15, 4.9], ["Dr. Hewa Salim", 6, 4.3]],
  "dermatology"      => [["Dr. Niga Mahmoud", 10, 4.6]],
  "pulmonology"      => [["Dr. Bahram Karimi", 18, 4.8]],
  "gastroenterology" => [["Dr. Shadi Tahir", 9, 4.4]],
  "orthopedics"      => [["Dr. Soran Aziz", 14, 4.7]],
  "psychiatry"       => [["Dr. Mahsa Noori", 11, 4.6]],
  "emergency"        => [["Dr. ER Triage Lead", 20, 4.9]]
}

sample_doctors.each do |slug, list|
  specialty = Specialty.find_by!(slug: slug)
  list.each do |name, years, rating|
    Doctor.find_or_create_by!(name: name, specialty: specialty) do |d|
      d.experience_years = years
      d.rating = rating
      d.bio_fa = "#{name} با #{years} سال تجربه."
      d.bio_ckb = "#{name} بە #{years} ساڵ ئەزموون."
    end
  end
end

puts "Seeded #{Specialty.count} specialties, #{Doctor.count} doctors."
