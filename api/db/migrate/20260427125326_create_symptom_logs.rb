class CreateSymptomLogs < ActiveRecord::Migration[8.0]
  def change
    create_table :symptom_logs do |t|
      t.references :user, null: true, foreign_key: true
      t.jsonb :symptoms, null: false, default: []
      t.integer :severity
      t.string :body_area
      t.integer :duration_hours
      t.references :recommended_specialty, null: true, foreign_key: { to_table: :specialties }
      t.boolean :red_flag, null: false, default: false

      t.timestamps
    end
    add_index :symptom_logs, :red_flag
  end
end
