class CreateAssessments < ActiveRecord::Migration[8.0]
  def change
    create_table :assessments do |t|
      t.references :user, null: false, foreign_key: true
      t.string  :primary_symptom, null: false
      t.text    :additional_info
      t.string  :body_area
      t.integer :intensity, null: false, default: 5
      t.integer :duration_hours
      t.jsonb   :result, null: false, default: {}

      t.timestamps
    end

    add_index :assessments, :created_at
  end
end
