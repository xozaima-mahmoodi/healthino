require "rails_helper"

RSpec.describe DoctorRanking::Ranker do
  let(:specialty) { create(:specialty) }

  it "orders by rating desc, then experience desc" do
    mid     = create(:doctor, specialty: specialty, rating: 4.5, experience_years: 5)
    top     = create(:doctor, specialty: specialty, rating: 4.9, experience_years: 2)
    tie_exp = create(:doctor, specialty: specialty, rating: 4.5, experience_years: 15)

    expect(described_class.new(specialty).call.to_a).to eq([top, tie_exp, mid])
  end

  it "limits results (default 5)" do
    7.times { |i| create(:doctor, specialty: specialty, rating: 4.0 + i * 0.1) }
    expect(described_class.new(specialty).call.size).to eq(5)
  end

  it "honors a custom limit" do
    7.times { create(:doctor, specialty: specialty) }
    expect(described_class.new(specialty, limit: 3).call.size).to eq(3)
  end

  it "scopes to the given specialty" do
    other = create(:specialty)
    own = create(:doctor, specialty: specialty)
    create(:doctor, specialty: other)
    expect(described_class.new(specialty).call.to_a).to eq([own])
  end
end
