# Stage 1: Build lightweight static bundle
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

# Stage 2: Ultra-minimal Alpine Nginx runtime (< 20MB total image size)
FROM nginx:1.27-alpine-slim AS runtime

# Remove default nginx static resources
RUN rm -rf /usr/share/nginx/html/*

# Copy custom hardened zero-network nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy production build artifacts
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
