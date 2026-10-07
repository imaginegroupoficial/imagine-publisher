FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY web ./
RUN npx vite build

FROM node:22-slim AS server
WORKDIR /server
COPY server/package.json server/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY server ./
RUN npx tsc

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=server /server/dist ./dist
COPY --from=web /web/dist ./public
RUN mkdir -p /app/data
EXPOSE 3005
CMD ["node", "dist/index.js"]
