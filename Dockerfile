FROM node:22-alpine AS ui
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts ./
COPY web ./web
COPY public ./public
RUN npm run build

FROM python:3.12-slim
ARG INSTALL_CLAMAV=0
RUN if [ "$INSTALL_CLAMAV" = "1" ]; then \
      apt-get update && apt-get install -y --no-install-recommends clamav clamav-freshclam && \
      rm -rf /var/lib/apt/lists/*; \
    fi
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DEVVAULT_DATA=/data PORT=3000
WORKDIR /app
COPY requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock && useradd -r -u 10001 -d /app devvault && install -d -m 0700 -o devvault -g devvault /data /backups
COPY --from=ui /src/dist ./dist
COPY server ./server
COPY scripts ./scripts
COPY LICENSE ./LICENSE
USER devvault
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=4s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3000/api/health',timeout=3).read()"
CMD ["python", "scripts/serve.py"]
