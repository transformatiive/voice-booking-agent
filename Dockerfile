# Multi-stage build for the Atende voice-agents service (Railway-ready).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx tsc -p tsconfig.build.json
COPY web/package.json web/package-lock.json ./web/
RUN npm ci --prefix web
COPY web ./web
RUN npm run build --prefix web

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV TZ=Europe/Lisbon
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
COPY public ./public
ENV DATA_DIR=/data
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "dist/server.js"]
