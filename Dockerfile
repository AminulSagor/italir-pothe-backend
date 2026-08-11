FROM node:22-bookworm-slim

WORKDIR /app

# Install Python + Puppeteer/Chrome requirements
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    ca-certificates \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Create isolated Python environment
RUN python3 -m venv /opt/piper-venv

# Install Piper
RUN /opt/piper-venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/piper-venv/bin/pip install --no-cache-dir piper-tts

# Piper configuration
ENV PIPER_PYTHON=/opt/piper-venv/bin/python
ENV PIPER_DATA_DIR=/app/piper-voices
ENV PIPER_VOICE=it_IT-paola-medium

# Puppeteer browser cache
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Download Italian voice during build
RUN mkdir -p /app/piper-voices \
    && /opt/piper-venv/bin/python \
    -m piper.download_voices \
    --data-dir /app/piper-voices \
    it_IT-paola-medium

# Install NestJS dependencies
COPY package*.json ./

# Skip automatic Chrome download here
RUN PUPPETEER_SKIP_DOWNLOAD=true npm ci

# Install Chrome + required Linux dependencies
RUN npx puppeteer browsers install chrome --install-deps

# Copy project
COPY . .

# Build NestJS
RUN npm run build

CMD ["npm", "run", "start:prod"]