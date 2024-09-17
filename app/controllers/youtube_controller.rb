class YoutubeController < ApplicationController
    def index
    end
  
    def download_audio
      video_url = params[:url]
      if video_url.present?
        system("yt-dlp -x --audio-format mp3 #{video_url}")
        flash[:notice] = "Áudio baixado com sucesso!"
      else
        flash[:alert] = "URL inválida!"
      end
      redirect_to root_path
    end
end
  