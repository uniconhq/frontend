# A static bundle behind nginx. /api belongs to the proxy in `deploy`, which
# puts this container and the backend on one origin.
FROM node:24.13.1-alpine AS build

# A build argument, not a run-time variable: a static file cannot read the
# container's environment.
ARG VITE_FORGE_URL=http://localhost:3300
ENV VITE_FORGE_URL=$VITE_FORGE_URL

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Runs as uid 101, never root. A non-root process cannot bind below port 1024,
# so this listens on 8080 and the proxy in `deploy` points at frontend:8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080

# index.html, not /, so a catch-all fallback does not read as healthy.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:8080/index.html || exit 1
