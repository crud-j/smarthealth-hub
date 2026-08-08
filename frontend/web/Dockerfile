# ─────────────────────────────────────────────────────────────────────────────
# SmartHealth Hub — Frontend Dockerfile
# Multi-stage build using Next.js standalone output mode.
#
# Requires next.config.ts to include `output: "standalone"`.
# The standalone output copies only the files Next.js needs to serve the app
# into .next/standalone, so the runtime image has no node_modules and is
# significantly smaller than a full npm install.
#
# Usage (from project root):
#   docker build -f frontend/web/Dockerfile -t smarthealth-frontend frontend/web/
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: deps ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

# libc6-compat is required on Alpine for certain native bindings.
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package manifests first to leverage Docker layer caching.
COPY package.json package-lock.json* ./

# Use ci (not install) so the exact lock-file versions are reproduced.
RUN npm ci

# ── Stage 2: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy installed node_modules from the deps stage.
COPY --from=deps /app/node_modules ./node_modules

# Copy full source.
COPY . .

# Disable Next.js telemetry during build.
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application.  output: "standalone" in next.config.ts causes Next.js
# to emit a minimal server into .next/standalone that can run without the full
# node_modules tree.
RUN npm run build

# ── Stage 3: runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# Non-root user — all files owned by nextjs for least-privilege operation.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs

# Copy the standalone server output.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy the static assets (public dir and compiled client assets).
# Next.js standalone does NOT include these — they must be copied explicitly.
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

ENV PORT=3000 \
    HOSTNAME="0.0.0.0"

# server.js is the standalone entry point emitted by Next.js into .next/standalone.
CMD ["node", "server.js"]
