# Multi-stage build for the Atende voice-agents service (Railway-ready).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV TZ=Europe/Lisbon
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY public ./public
# DATA_DIR can be mounted as a Railway volume for persistence.
ENV DATA_DIR=/data
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "dist/server.js"]
