Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      get  "ping", to: "health#ping"
      post "symptom_checker", to: "symptom_checker#create"
      post "auth/register",   to: "auth#register"
      post "auth/login",      to: "auth#login"
      get   "me",   to: "me#show"
      patch "user", to: "me#update"
      put   "profile/update_password", to: "profile#update_password"
      resources :specialties, only: %i[index show]
      resources :doctors,     only: %i[index show]
      resources :assessments, only: %i[index] do
        collection do
          post :analyze_document
        end
      end
    end
  end
end
