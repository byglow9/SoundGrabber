FROM python:3.11-slim

# Phase 13 D-04..D-07: slim Python base with system ffmpeg/ffprobe and Node 22.
# Debian bookworm's default nodejs is 18.x, so NodeSource is used for Node >=22.
# yt-dlp's EJS signature/n-challenge solver requires Node >=22.6 (Node 20 is
# rejected as "unsupported" at runtime, causing "Requested format is not
# available" for every YouTube client — yt-dlp/yt-dlp#15012).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        curl \
        libsndfile1 \
        ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements before source so Docker can cache the Python dependency layer.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--limit-concurrency", "100", "--timeout-keep-alive", "5"]
