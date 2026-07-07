# syntax=docker/dockerfile:1
FROM node:18-bookworm-slim AS deps
WORKDIR /app
# openssl is required for Prisma's query engine to detect the correct libssl
# target at `prisma generate` time (step below) and to run at all — the
# bookworm-slim base has no libssl installed by default, which makes Prisma
# fall back to a guessed "openssl-1.1.x" binary that isn't present on this
# (OpenSSL 3.x) image, failing at runtime with "libssl.so.1.1: cannot open
# shared object file". Installing openssl here fixes detection for both the
# `deps`/`build` stages and (since `runtime` installs it separately below)
# the final image.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
# --force: the root package.json declares @rolldown/binding-darwin-arm64 as a
# plain (non-optional) dependency, a macOS-only native binding unrelated to the
# server. npm's platform check (EBADPLATFORM) treats this as fatal under plain
# `npm ci` on Linux even when only installing the server workspace, since the
# check runs against the whole lockfile tree. --force downgrades this to a
# warning; the package is unused by server code, so this is safe here.
RUN npm ci --workspace=server --include-workspace-root --force

FROM deps AS build
COPY server ./server
RUN npm exec --workspace=server -- prisma generate
RUN npm run build --workspace=server

FROM node:18-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/dist ./server/dist
COPY server/package.json ./server/package.json
WORKDIR /app/server
CMD ["node", "dist/app.js"]
