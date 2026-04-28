# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2026_04_28_100100) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "assessments", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "primary_symptom", null: false
    t.text "additional_info"
    t.string "body_area"
    t.integer "intensity", default: 5, null: false
    t.integer "duration_hours"
    t.jsonb "result", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["created_at"], name: "index_assessments_on_created_at"
    t.index ["user_id"], name: "index_assessments_on_user_id"
  end

  create_table "doctors", force: :cascade do |t|
    t.string "name"
    t.bigint "specialty_id", null: false
    t.integer "experience_years", default: 0, null: false
    t.decimal "rating", precision: 3, scale: 2, default: "0.0", null: false
    t.text "bio_fa"
    t.text "bio_ckb"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["specialty_id"], name: "index_doctors_on_specialty_id"
  end

  create_table "specialties", force: :cascade do |t|
    t.string "slug"
    t.string "name_fa"
    t.string "name_ckb"
    t.text "description_fa"
    t.text "description_ckb"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["slug"], name: "index_specialties_on_slug", unique: true
  end

  create_table "symptom_logs", force: :cascade do |t|
    t.bigint "user_id"
    t.jsonb "symptoms", default: [], null: false
    t.integer "severity"
    t.string "body_area"
    t.integer "duration_hours"
    t.bigint "recommended_specialty_id"
    t.boolean "red_flag", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["recommended_specialty_id"], name: "index_symptom_logs_on_recommended_specialty_id"
    t.index ["red_flag"], name: "index_symptom_logs_on_red_flag"
    t.index ["user_id"], name: "index_symptom_logs_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "name"
    t.string "email"
    t.string "password_digest"
    t.integer "age"
    t.string "gender"
    t.jsonb "chronic_conditions", default: [], null: false
    t.string "preferred_locale", default: "fa", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "api_token", null: false
    t.boolean "is_doctor", default: false, null: false
    t.index ["api_token"], name: "index_users_on_api_token", unique: true
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["is_doctor"], name: "index_users_on_is_doctor"
  end

  add_foreign_key "assessments", "users"
  add_foreign_key "doctors", "specialties"
  add_foreign_key "symptom_logs", "specialties", column: "recommended_specialty_id"
  add_foreign_key "symptom_logs", "users"
end
