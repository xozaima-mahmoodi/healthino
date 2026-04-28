class AddApiTokenAndDoctorFlagToUsers < ActiveRecord::Migration[8.0]
  def up
    add_column :users, :api_token, :string
    add_column :users, :is_doctor, :boolean, default: false, null: false

    User.reset_column_information
    User.find_each do |u|
      u.update_columns(api_token: SecureRandom.hex(24)) if u.read_attribute(:api_token).blank?
    end

    change_column_null :users, :api_token, false
    add_index :users, :api_token, unique: true
    add_index :users, :is_doctor
  end

  def down
    remove_index :users, :is_doctor
    remove_index :users, :api_token
    remove_column :users, :is_doctor
    remove_column :users, :api_token
  end
end
