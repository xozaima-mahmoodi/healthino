class CreateDoctors < ActiveRecord::Migration[8.0]
  def change
    create_table :doctors do |t|
      t.string :name
      t.references :specialty, null: false, foreign_key: true
      t.integer :experience_years, null: false, default: 0
      t.decimal :rating, precision: 3, scale: 2, null: false, default: 0
      t.text :bio_fa
      t.text :bio_ckb

      t.timestamps
    end
  end
end
