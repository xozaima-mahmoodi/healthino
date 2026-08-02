require "spec_helper"
ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
abort("The Rails environment is running in production mode!") if Rails.env.production?
require "rspec/rails"
require "factory_bot_rails"
require "database_cleaner/active_record"

Rails.root.glob("spec/support/**/*.rb").sort_by(&:to_s).each { |f| require f }

begin
  ActiveRecord::Migration.maintain_test_schema!
rescue ActiveRecord::PendingMigrationError => e
  abort e.to_s.strip
end

# dotenv loads api/.env in the test environment too, so a developer's local AI
# backend configuration would otherwise decide what the suite asserts — e.g. an
# OPENROUTER_MODELS override pointing at a non-OpenRouter backend makes the
# request-shape specs see bare model slugs instead of the namespaced defaults.
# Cleared for the whole run so specs are deterministic on any machine and in CI;
# a spec that wants an override sets it explicitly (and restores it).
%w[OPENROUTER_MODELS OPENROUTER_MODEL OPENROUTER_BASE_URL AI_STUB].each do |key|
  ENV.delete(key)
end

RSpec.configure do |config|
  config.use_transactional_fixtures = true
  config.infer_spec_type_from_file_location!
  config.filter_rails_from_backtrace!

  config.include FactoryBot::Syntax::Methods

  config.before(:suite) do
    DatabaseCleaner.strategy = :transaction
    DatabaseCleaner.clean_with(:truncation)
  end

  config.around(:each) do |example|
    if example.metadata[:no_transaction]
      DatabaseCleaner.strategy = :truncation
      config.use_transactional_fixtures = false
      DatabaseCleaner.cleaning { example.run }
      config.use_transactional_fixtures = true
    else
      example.run
    end
  end
end
