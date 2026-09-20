# Stage 0: the language package, from the sibling itb-cli checkout.
#
# app/package.json links @opentestbed/otb-gherkin as file:../../itb-cli/packages/gherkin,
# which a docker build cannot see from this repo alone. compose.plugin.yml passes
# that folder in as an additional build context named "gherkin-src", so the
# image compiles with the SAME language the workbench and the CLI use on the
# host — never a stale copy from the registry.
#   docker build --build-context gherkin-src=../itb-cli/packages/gherkin .
FROM node:22 AS gherkin
WORKDIR /gherkin
COPY --from=gherkin-src package.json tsconfig.json ./
COPY --from=gherkin-src src ./src
COPY --from=gherkin-src lang ./lang
# The package ships no lockfile (its only dependency is js-yaml). Build it,
# keep only its runtime dependency (vite resolves a linked package's imports
# from the link's own node_modules), and drop the `prepare` script so the
# app's `npm ci` does not try to re-run tsc on the link.
RUN npm install --no-audit --no-fund --ignore-scripts && npm run build \
 && npm prune --omit=dev --no-audit --no-fund && rm -f package-lock.json \
 && npm pkg delete scripts.prepare

# Stage 1: build the workbench SPA (network available at docker build time)
FROM node:22 AS build
# The app's lockfile records the language as a link at ../../itb-cli/packages/gherkin,
# and npm matches that key against the path RELATIVE to the app directory. Two
# levels below the root is therefore not optional: from /w/app that path is
# /itb-cli/packages/gherkin; from /app it would collapse to /itb-cli/… and npm
# would crash in loadVirtual instead of reading the lockfile.
WORKDIR /w/app
COPY --from=gherkin /gherkin /itb-cli/packages/gherkin
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
# .dockerignore keeps app/node_modules out of this copy.
COPY app/ .
# serve at / (the repo default base is the gh-pages path), talk to in-network ITB
ENV VITE_BASE_PATH=/
ENV VITE_ITB_BASE_URL=http://gitb-ui:9000
RUN npm run build-only

# Stage 2: tiny runtime — static SPA + manager API + ITB proxy, zero npm deps
FROM node:22-alpine
WORKDIR /srv
COPY --from=build /w/app/dist ./dist
COPY server.mjs manager.html ./
ENV PORT=8000 CLI_DIR=/cli
EXPOSE 8000
CMD ["node", "server.mjs"]
