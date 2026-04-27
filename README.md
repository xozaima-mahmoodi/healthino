# Healthino

Smart Triage & Doctor Recommendation system. Bilingual (Persian / Sorani Kurdish), mobile-first.

## Stack

- **api/** — Rails 8 API, PostgreSQL
- **web/** — Vue 3 (Composition API), Vite, Tailwind, Pinia, Vue Router, vue-i18n, Vazirmatn font

## Run

```bash
bin/dev
```

Runs Rails API on `:3000` and Vite on `:5173` via foreman. Vite proxies `/api/*` to Rails.

## First-time setup

```bash
# api
cd api && bundle install && bin/rails db:create db:migrate db:seed

# web
cd ../web && npm install
```

## Layout

```
healthino/
├── api/                              # Rails 8 API
│   ├── app/
│   │   ├── controllers/api/v1/
│   │   │   └── symptom_checker_controller.rb
│   │   ├── models/                   # User, Specialty, Doctor, SymptomLog
│   │   └── services/
│   │       ├── symptom_checker/      # Engine, RedFlagDetector, SpecialtyMatcher
│   │       └── doctor_ranking/       # Ranker
│   ├── config/
│   │   ├── database.yml
│   │   └── routes.rb
│   └── db/
│       ├── migrate/
│       └── seeds.rb
├── web/                              # Vue 3 + Vite
│   ├── src/
│   │   ├── api/client.js
│   │   ├── components/
│   │   │   ├── LanguageSwitcher.vue
│   │   │   └── SymptomForm.vue
│   │   ├── i18n/index.js
│   │   ├── locales/
│   │   │   ├── fa.json
│   │   │   └── ckb.json
│   │   ├── router/index.js
│   │   ├── stores/                   # Pinia: locale, symptom
│   │   └── views/
│   │       ├── Landing.vue
│   │       └── Symptoms.vue
│   ├── tailwind.config.js
│   └── vite.config.js
├── Procfile.dev
├── bin/dev
└── README.md
```

## Symptom Checker

`POST /api/v1/symptom_checker`

```json
{
  "symptoms": ["headache", "fever"],
  "severity": 6,
  "body_area": "head",
  "duration_hours": 12,
  "locale": "fa"
}
```

Returns: red-flag verdict, recommended specialty (localized), ranked doctors, and the persisted `symptom_log_id`.

## Localization

- `fa` (Persian) and `ckb` (Sorani Kurdish), both RTL.
- Vazirmatn served via `@fontsource/vazirmatn` — supports both scripts.
- Switcher persists choice in `localStorage`.
