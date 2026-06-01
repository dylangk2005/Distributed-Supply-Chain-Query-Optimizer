FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY backend/package*.json ./
RUN npm install
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip python3-venv build-essential \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY partitioner/requirements.txt /tmp/partitioner-requirements.txt
COPY importer/requirements.txt /tmp/importer-requirements.txt
RUN python3 -m pip install --break-system-packages --no-cache-dir -r /tmp/partitioner-requirements.txt -r /tmp/importer-requirements.txt
COPY --from=build /app/dist ./dist
COPY generator ./generator
COPY partitioner ./partitioner
COPY importer ./importer
COPY postgres ./postgres
CMD ["node", "dist/app.js"]
