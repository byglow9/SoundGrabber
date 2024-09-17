Rails.application.routes.draw do
  root 'youtube#index'
  post 'download_audio', to: 'youtube#download_audio'
end
