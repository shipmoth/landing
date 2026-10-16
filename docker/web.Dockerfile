# syntax=docker/dockerfile:1
# The built site behind nginx. Build context: the repository root (see compose.yaml).
#
#   docker compose up -d --build        # or: docker build -f docker/web.Dockerfile -t shipmoth-web .
#
# Stage 1 builds apps/web/dist with the lockfile's exact dependencies and gzips the text files.
# Stage 2 is nginx-unprivileged's alpine-slim (nginx + busybox, runs as uid 101) plus the site
# and docker/nginx/default.conf; nothing from node ends up in it.

ARG NODE_IMAGE=node:22.23.3-alpine3.24
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.30.6-alpine3.24-slim

FROM ${NODE_IMAGE} AS build
ENV CI=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    ASTRO_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
# pnpm as pinned by "packageManager" in package.json
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo

# manifests first, so the install layer is reused until a dependency changes
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/ascii-art/package.json packages/ascii-art/
# only the site and the workspace packages it depends on (not the root's turbo/typescript)
RUN --mount=type=cache,id=shipmoth-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@shipmoth/web..."

COPY tsconfig.base.json ./
COPY packages/ascii-art packages/ascii-art
COPY apps/web apps/web
# `pnpm build` minus turbo: the build script of the site and of what it depends on, in order
RUN pnpm --filter "@shipmoth/web..." run build \
 && find apps/web/dist -type f \( -name '*.html' -o -name '*.md' -o -name '*.txt' -o -name '*.svg' \) \
      -exec gzip -9 -k {} +

FROM ${NGINX_IMAGE}
# drop the stock welcome page and 50x.html
USER root
RUN rm -rf /usr/share/nginx/html/*
USER 101
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
RUN nginx -t
EXPOSE 8080
# busybox wget is in the image (curl is not)
HEALTHCHECK --interval=30s --timeout=3s --retries=3 --start-period=10s --start-interval=1s \
    CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
