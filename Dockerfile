# syntax=docker/dockerfile:1

# 1. Frontend (React + Vite)
FROM node:22.23.2-slim AS frontend
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY frontend/ ./
RUN npm run build

# 2. Dependències de Python (pycups necessita compilar contra libcups)
FROM python:3.13.14-slim-trixie AS builder
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential libcups2-dev \
 && rm -rf /var/lib/apt/lists/*
RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# 3. Imatge final
FROM python:3.13.14-slim-trixie
ARG INSTALL_OFFICE=false
RUN apt-get update \
 && apt-get install -y --no-install-recommends libcups2t64 fonts-dejavu-core \
 && if [ "$INSTALL_OFFICE" = "true" ]; then \
      apt-get install -y --no-install-recommends \
        libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui; \
    fi \
 && rm -rf /var/lib/apt/lists/*
# L'usuari ha de dir-se igual que a l'amfitrió (coco, uid 1000): CUPS compara
# el nom que enviem amb l'uid del socket (PeerCred)
RUN groupadd -g 1000 coco && useradd -u 1000 -g 1000 -M -d /data coco \
 && mkdir -p /data && chown coco:coco /data
COPY --from=builder /opt/venv /opt/venv
WORKDIR /app
COPY backend/app ./app
COPY --from=frontend /src/dist ./static
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DATA_DIR=/data \
    STATIC_DIR=/app/static \
    TZ=Europe/Madrid \
    PORT=7100
USER 1000:1000
EXPOSE 7100
CMD ["python", "-m", "app"]
