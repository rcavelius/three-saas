# syntax=docker/dockerfile:1.7
# One image recipe for every app. Build from the repo root:
#   docker build --build-arg APP=changekite -t changekite .
# APP is one of: changekite | datapolish | webhooktrail
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-slim AS build
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm ci --no-fund --no-audit
ARG APP
RUN test -n "$APP" && npm run build -w @apps/${APP} && mkdir -p apps/${APP}/public

FROM node:${NODE_VERSION}-slim AS run
ARG APP
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    APP=${APP}
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build --chown=node:node /repo/apps/${APP}/public ./apps/${APP}/public
USER node
EXPOSE 8080
CMD ["sh", "-c", "exec node apps/${APP}/server.js"]
