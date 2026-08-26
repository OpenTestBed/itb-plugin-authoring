import React from 'react'
import ReactDOM from 'react-dom/client'
import { setAssetBase } from '@opentestbed/otb-gherkin'
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
// Plugin-dialect step colours for the Monaco decorations set in Editor.tsx.
import './App.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)