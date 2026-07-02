# syntax=docker/dockerfile:1.6
FROM node:20-alpine

# Native ffmpeg for server-side WebM→MP4 conversion (10-20x faster than wasm)
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Install deps (no devDeps, no audit, no fund noise)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# App source
COPY src ./src

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:${PORT}/health || exit 1

CMD ["node", "src/index.js"]
