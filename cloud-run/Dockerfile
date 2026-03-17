FROM node:20-slim

# ffmpeg + ffprobe 설치
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "src/index.js"]
