FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production ODYSSEY_HOST=0.0.0.0 ODYSSEY_PORT=8787
COPY --from=build /app /app
RUN mkdir -p server/data && chown -R node:node server/data
USER node
EXPOSE 8787
CMD ["npx", "tsx", "server/index.ts"]
