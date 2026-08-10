FROM node:20-bookworm-slim

WORKDIR /app

# Install Python
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    ca-certificates \
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

# Download Italian voice during build
RUN mkdir -p /app/piper-voices \
    && /opt/piper-venv/bin/python \
    -m piper.download_voices \
    --data-dir /app/piper-voices \
    it_IT-paola-medium

# Install NestJS dependencies
COPY package*.json ./
RUN npm ci

# Copy project
COPY . .

# Build NestJS
RUN npm run build

CMD ["npm", "run", "start:prod"]