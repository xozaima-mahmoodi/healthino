class CreateSpecialties < ActiveRecord::Migration[8.0]
  def change
    create_table :specialties do |t|
      t.string :slug
      t.string :name_fa
      t.string :name_ckb
      t.text :description_fa
      t.text :description_ckb

      t.timestamps
    end
    add_index :specialties, :slug, unique: true
  end
end
