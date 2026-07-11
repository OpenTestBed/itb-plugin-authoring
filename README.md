# itb-plugin-authoring

ONE app for test authoring on ITB — a **functionality plugin** (it extends the
ITB installation, not the test language):

- **/** — the Gherkin workbench: Monaco editor, dialect-aware step catalog
  (`fhir:`, `hcert:`, ... synced from the language plugins), live suite-XML
  preview, direct deploy (via the built-in ITB proxy).
- **/manager** — the test manager: pick a feature, Compile / Init / Deploy /
  Run / Status. Every button shells out to the mounted `itb-cli` 1:1, so CLI
  and UI can never disagree.

## Run (docker compose, next to the ITB core)

```powershell
cd itb-starter
docker compose -f docker-compose.yml `
  -f ..\itb-plugin-fhir-validator\compose.plugin.yml `
  -f ..\itb-plugin-hcert-decoder\compose.plugin.yml `
  -f ..\itb-plugin-authoring\compose.plugin.yml up -d --build
```

Then: http://localhost:10004 (workbench) and http://localhost:10004/manager.
The image build compiles the SPA (npm inside docker build — no local npm needed).

## Layout

| Path | What |
|---|---|
| `itb-plugin.yaml` | manifest (`kind: functionality`, no dialect, no GITB handler) |
| `compose.plugin.yml` | the service fragment; mounts `../itb-cli` at `/cli` |
| `Dockerfile` | stage 1 vite-builds `app/`, stage 2 runs `server.mjs` (no npm deps) |
| `server.mjs` | static SPA + `/manager` + `/api/cli` (allowlisted itb-suite commands) + `/itb-proxy` (same contract as the Vite dev proxy) |
| `app/` | the workbench sources (former test-workbench) — canonical parser home; `itb-cli` transpiles its parser from here (`build-compiler.mjs`) and syncs plugin dialects into `app/public/components/` (`sync-dialects.mjs`) |

## Dev mode (hot reload)

```powershell
cd app
npm install
npm run dev        # Vite dev server with the same /itb-proxy middleware
```
