class AddDemographicsAndHistoryToAssessments < ActiveRecord::Migration[8.0]
  def change
    change_table :assessments do |t|
      t.string  :gender
      t.integer :age
      t.boolean :medical_history, null: false, default: false
      t.string  :medical_history_details
      t.boolean :medication, null: false, default: false
      t.string  :medication_details
    end
  end
end
