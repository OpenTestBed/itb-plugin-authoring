import React from 'react'
import ReactDOM from 'react-dom/client'
import { setAssetBase, setCatalogSource, createBrowserSource } from '@opentestbed/otb-gherkin'
// The core language, bundled from the package that implements it. Vite's ?raw
// inlines the file, so there is exactly ONE en.yml — the one shipped inside
// @opentestbed/otb-gherkin. The app used to keep its own copy in public/lang/,
// which meant a step-pattern change had to be applied to both by hand and could
// silently drift apart.
import enYml from '@opentestbed/otb-gherkin/lang/en.yml?raw'
import App from './App.tsx'
import './index.css'

// The compiler resolves lang/ and components/ against this base. It used to
// read import.meta.env.BASE_URL itself, but that global only exists under
// Vite, which is what stopped the parser building anywhere else. The value is
// injected now — and it MUST be, because vite.config.ts serves this app under
// a base path (/test-workbench/ by default, VITE_BASE_PATH to override).
// Leaving it at the '/' default makes the catalog 404 with
// "Failed to load catalog: /lang/en.yml".
setAssetBase(import.meta.env.BASE_URL || '/')

// Serve lang/en.yml from the bundle; everything else (component dialects, which
// are genuinely external and synced from their plugin repos) still goes over
// fetch, and enablement still comes from localStorage.
setCatalogSource(createBrowserSource({ assets: { 'lang/en.yml': enYml } }))
// Plugin-dialect step colours for the Monaco decorations set in Editor.tsx.
import './App.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)