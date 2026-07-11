# Stage 1: build the workbench SPA (network available at docker build time)
FROM node:22 AS build
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ .
# serve at / (the repo default base is the gh-pages path), talk to in-network ITB
ENV VITE_BASE_PATH=/
ENV VITE_ITB_BASE_URL=http://gitb-ui:9000
RUN npm run build-only

# Stage 2: tiny runtime — static SPA + manager API + ITB proxy, zero npm deps
FROM node:22-alpine
WORKDIR /srv
COPY --from=build /app/dist ./dist
COPY server.mjs manager.html ./
ENV PORT=8000 CLI_DIR=/cli
EXPOSE 8000
CMD ["node", "server.mjs"]
