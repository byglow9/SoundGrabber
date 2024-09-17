class YoutubeController < ApplicationController
    require 'securerandom'
  
    def download_audio
      video_url = params[:url]
      if video_url.present?
        # Cria um nome temporário para o arquivo de áudio
        file_name = SecureRandom.hex(10) + ".mp3"
        file_path = Rails.root.join('tmp', file_name)
  
        # Executa o yt-dlp para baixar o áudio
        system("yt-dlp -x --audio-format mp3 -o '#{file_path}' #{video_url}")
  
        # Envia o arquivo baixado como download para o navegador
        if File.exist?(file_path)
          send_file file_path, type: 'audio/mpeg', disposition: 'attachment'
          
        else
          flash[:alert] = "Erro ao baixar o áudio!"
          redirect_to root_path  # Redireciona para a página inicial caso haja erro
        end
      else
        flash[:alert] = "URL inválida!"
        redirect_to root_path  # Redireciona para a página inicial se a URL estiver inválida
      end
    end
end
  