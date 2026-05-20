# syntax=docker/dockerfile:1.6

# Stage 1 — build the Vite bundle
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# Stage 2 — serve via nginx
FROM nginx:1.27-alpine

# Replace default site config with SPA-friendly one
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Magic Containers expects the app to listen on $PORT (default 80)
EXPOSE 80

# Healthcheck on root
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
