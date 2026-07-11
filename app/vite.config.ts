import { defineConfig, Plugin, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

/** Docker MySQL settings for ITB ID resolution — read from .env at server start */
function getDbConfig(env: Record<string, string>) {
  return {
    container: env.ITB_MYSQL_CONTAINER || 'itb-mysql',
    user: env.ITB_MYSQL_USER || 'root',
    password: env.ITB_MYSQL_PASSWORD || 'root',
    database: env.ITB_MYSQL_DATABASE || 'gitb',
  };
}

/**
 * Vite dev plugin: resolve ITB numeric database IDs via docker exec → MySQL.
 * GET /api/itb-ids?suite=<identifier>&actors=<apiKey1,apiKey2>&org=<orgApiKey>
 */
/**
 * Vite dev plugin: dynamic reverse proxy for ITB API calls.
 * The target base URL is encoded in the path:
 *   /itb-proxy/<encoded-base-url>/rest/of/path
 * e.g. /itb-proxy/http%3A%2F%2Flocalhost%3A9000/api/rest/testsuite/deploy
 *   → forwards to http://localhost:9000/api/rest/testsuite/deploy
 */
function itbProxy(): Plugin {
  return {
    name: 'itb-proxy',
    configureServer(server) {
      server.middlewares.use('/itb-proxy', async (req, res) => {
        // Extract encoded base URL from path: /itb-proxy/<encoded-base>/rest...
        const rawPath = (req.url || '/');
        const afterPrefix = rawPath.replace(/^\//, ''); // remove leading /
        const slashIdx = afterPrefix.indexOf('/');
        if (slashIdx < 0) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing target base in path' }));
          return;
        }
        const targetBase = decodeURIComponent(afterPrefix.substring(0, slashIdx));
        const path = afterPrefix.substring(slashIdx);
        const targetUrl = `${targetBase.replace(/\/+$/, '')}${path}`;

        try {
          // Collect request body
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
          }
          const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);

          // Forward headers (except host and the custom header)
          const fwdHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(req.headers)) {
            if (k === 'host' || k === 'x-itb-target' || k === 'connection') continue;
            if (typeof v === 'string') fwdHeaders[k] = v;
          }

          const resp = await fetch(targetUrl, {
            method: req.method || 'GET',
            headers: fwdHeaders,
            body: body && body.length > 0 ? body : undefined,
            signal: controller.signal,
            // @ts-ignore -- duplex required for node fetch with body
            duplex: body ? 'half' : undefined,
          });
          clearTimeout(timeout);

          res.statusCode = resp.status;
          // Forward response headers
          for (const [k, v] of resp.headers.entries()) {
            if (k === 'transfer-encoding') continue;
            res.setHeader(k, v);
          }
          const respBody = await resp.arrayBuffer();
          res.end(Buffer.from(respBody));
        } catch (err: any) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err?.message || 'proxy error' }));
        }
      });
    },
  };
}

/**
 * Vite dev plugin: proxy health checks to avoid CORS issues.
 * GET /api/health-proxy?url=<encoded-url>&method=<GET|POST>
 */
function healthProxy(): Plugin {
  return {
    name: 'health-proxy',
    configureServer(server) {
      server.middlewares.use('/api/health-proxy', async (req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);
        const target = url.searchParams.get('url');
        const method = url.searchParams.get('method') || 'GET';

        if (!target) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing url parameter' }));
          return;
        }

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(target, { method, signal: controller.signal });
          clearTimeout(timeout);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: resp.status }));
        } catch (err: any) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 0, error: err?.message || 'unreachable' }));
        }
      });
    },
  };
}

function itbIdResolver(db: { container: string; user: string; password: string; database: string }): Plugin {
  const dockerCmd = (sql: string) =>
    `docker exec -e MYSQL_PWD=${db.password} ${db.container} mysql -u ${db.user} ${db.database} -N -e "${sql}"`;

  return {
    name: 'itb-id-resolver',
    configureServer(server) {
      server.middlewares.use('/api/itb-ids', (req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);
        const suiteId = url.searchParams.get('suite') || '';
        const actorKeys = (url.searchParams.get('actors') || '').split(',').filter(Boolean);
        const orgKey = url.searchParams.get('org') || '';
        const sysKey = url.searchParams.get('system') || '';
        const communityKey = url.searchParams.get('community') || '';
        const sutActor = url.searchParams.get('sutActor') || '';

        try {
          const sql = `
            SELECT 'community' AS kind, id, api_key AS k FROM Communities WHERE api_key IS NOT NULL
            UNION ALL
            SELECT 'organisation', id, api_key FROM Organizations WHERE api_key IS NOT NULL
            UNION ALL
            SELECT 'system', id, api_key FROM Systems WHERE api_key IS NOT NULL
            UNION ALL
            SELECT 'actor', id, api_key FROM Actors WHERE api_key IS NOT NULL
            UNION ALL
            SELECT 'actor_by_id', id, actorId FROM Actors WHERE actorId IS NOT NULL
            UNION ALL
            SELECT 'testsuite', id, identifier FROM TestSuites WHERE identifier IS NOT NULL;
          `.replace(/\n/g, ' ');

          const raw = execSync(
            dockerCmd(sql),
            { encoding: 'utf-8', timeout: 5000 }
          );

          // Parse tab-separated rows
          const rows = raw.trim().split('\n').map(line => {
            const [kind, id, key] = line.split('\t');
            return { kind, id: Number(id), key };
          });

          const find = (kind: string, key: string) =>
            rows.find(r => r.kind === kind && r.key === key)?.id ?? null;

          const result: Record<string, number | null> = {
            communityId: communityKey ? find('community', communityKey) : null,
            testSuiteId: rows.find(r => r.kind === 'testsuite' && r.key === suiteId)?.id ?? null,
          };

          const dbQuery = (sql: string) => {
            try {
              return execSync(
                dockerCmd(sql),
                { encoding: 'utf-8', timeout: 3000 }
              ).trim();
            } catch { return ''; }
          };

          // Direct lookups from provided keys
          if (orgKey) result.organisationId = find('organisation', orgKey);
          if (sysKey) result.systemId = find('system', sysKey);
          // Prioritize the SUT actor for the execution URL
          if (sutActor) {
            const aid = find('actor', sutActor) ?? find('actor_by_id', sutActor);
            if (aid) result.actorId = aid;
          }
          // Fallback: try other actors from the deploy response
          if (!result.actorId) {
            for (const ak of actorKeys) {
              const aid = find('actor', ak) ?? find('actor_by_id', ak);
              if (aid) { result.actorId = aid; break; }
            }
          }

          // Resolve org from system owner
          if (!result.organisationId && result.systemId) {
            const v = dbQuery(`SELECT owner FROM Systems WHERE id = ${result.systemId}`);
            if (v) result.organisationId = Number(v) || null;
          }

          // Resolve org from community (first org with API key)
          if (!result.organisationId && result.communityId) {
            const v = dbQuery(`SELECT id FROM Organizations WHERE community = ${result.communityId} AND api_key IS NOT NULL ORDER BY id LIMIT 1`);
            if (v) result.organisationId = Number(v) || null;
          }

          // Resolve community from org
          if (!result.communityId && result.organisationId) {
            const v = dbQuery(`SELECT community FROM Organizations WHERE id = ${result.organisationId}`);
            if (v) result.communityId = Number(v) || null;
          }

          // Resolve system from org (first system owned by this org)
          if (!result.systemId && result.organisationId) {
            const v = dbQuery(`SELECT id FROM Systems WHERE owner = ${result.organisationId} ORDER BY id DESC LIMIT 1`);
            if (v) result.systemId = Number(v) || null;
          }

          // Resolve system from conformance with the found actor (if system still missing)
          if (!result.systemId && result.actorId) {
            const v = dbQuery(`SELECT sut_id FROM SystemImplementsActors WHERE actor_id = ${result.actorId} ORDER BY sut_id DESC LIMIT 1`);
            if (v) result.systemId = Number(v) || null;
          }

          // Resolve actor from test suite specification (if actor still missing)
          if (!result.actorId && result.testSuiteId) {
            const v = dbQuery(`SELECT a.id FROM SpecificationHasTestSuites shts JOIN SpecificationHasActors sha ON sha.spec_id = shts.spec JOIN Actors a ON a.id = sha.actor_id WHERE shts.testsuite = ${result.testSuiteId} LIMIT 1`);
            if (v) result.actorId = Number(v) || null;
          }

          // Look up API keys for resolved actor and system (for auto-conformance)
          const apiKeys: Record<string, string | null> = { actorApiKey: null, systemApiKey: null, specId: null };
          if (result.actorId) {
            apiKeys.actorApiKey = dbQuery(`SELECT api_key FROM Actors WHERE id = ${result.actorId}`) || null;
          }
          if (result.systemId) {
            apiKeys.systemApiKey = dbQuery(`SELECT api_key FROM Systems WHERE id = ${result.systemId}`) || null;
          }
          // Find the specification that owns the test suite
          if (result.testSuiteId) {
            apiKeys.specId = dbQuery(`SELECT spec FROM SpecificationHasTestSuites WHERE testsuite = ${result.testSuiteId} LIMIT 1`) || null;
          }
          // Auto-create conformance via REST API (DB inserts don't trigger snapshot generation)
          if (apiKeys.systemApiKey && apiKeys.actorApiKey) {
            try {
              // Find an org API key to authenticate
              const orgApiKey = result.organisationId
                ? dbQuery(`SELECT api_key FROM Organizations WHERE id = ${result.organisationId}`)
                : '';
              if (orgApiKey) {
                const { execSync: es } = require('child_process');
                es(`curl -s -X PUT "http://localhost:10003/api/rest/conformance/${apiKeys.systemApiKey}/${apiKeys.actorApiKey}" -H "ITB_API_KEY: ${orgApiKey}"`, { timeout: 5000 });
              }
            } catch { /* conformance may already exist — ignore */ }
          }

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ...result, ...apiKeys }));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err?.message || 'Failed to query ITB database' }));
        }
      });
    },
  };
}

/**
 * Vite dev plugin: REST API for Gherkin-to-TDL compilation.
 *
 * POST /api/compile
 *   Body: raw Gherkin text (Content-Type: text/plain)
 *   Returns: ZIP file (application/zip)
 *
 * POST /api/compile/testplan
 *   Body: FHIR TestPlan JSON (Content-Type: application/json)
 *   Extracts the Gherkin from the referenced feature file,
 *   compiles to TDL, and returns a ZIP.
 */
function compileApi(): Plugin {
  // Lazy-load parser modules (they use ESM, loaded at first request)
  let parserReady: Promise<{
    parse: (gherkin: string) => any;
    compile: (parsed: any) => { files: { filename: string; xml: string; type: string }[] };
  }> | null = null;

  function getParser() {
    if (!parserReady) {
      parserReady = (async () => {
        // We can't import the browser modules directly, so we'll use a simpler approach:
        // shell out to a Node script that does the compilation
        return {
          parse: (_gherkin: string) => null,
          compile: (_parsed: any) => ({ files: [] }),
        };
      })();
    }
    return parserReady;
  }

  return {
    name: 'compile-api',
    configureServer(server) {
      // POST /api/compile — Gherkin text → TDL ZIP
      server.middlewares.use('/api/compile', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'POST only' }));
          return;
        }

        // Read body
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const body = Buffer.concat(chunks).toString('utf-8');

        const url = new URL(req.url || '/', `http://${req.headers.host}`);
        const isTestPlan = url.pathname.endsWith('/testplan');

        let gherkinContent: string;

        if (isTestPlan) {
          // Parse TestPlan JSON, find the feature file reference
          try {
            const testPlan = JSON.parse(body);
            const suite = testPlan.suite?.[0];
            const featureFile = suite?.input?.find((i: any) => i.name === 'gherkin-script')?.file;
            if (!featureFile) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'TestPlan has no gherkin-script input' }));
              return;
            }
            // Try to load the feature file from public/
            const fs = await import('fs');
            const path = await import('path');
            const featurePath = path.join(process.cwd(), 'public', featureFile);
            if (!fs.existsSync(featurePath)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: `Feature file not found: ${featureFile}` }));
              return;
            }
            gherkinContent = fs.readFileSync(featurePath, 'utf-8');
          } catch (e: any) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: `Invalid TestPlan JSON: ${e.message}` }));
            return;
          }
        } else {
          gherkinContent = body;
        }

        if (!gherkinContent.trim()) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Empty Gherkin content' }));
          return;
        }

        try {
          // Use the Vite module runner to load the parser modules
          const mod = await server.ssrLoadModule('/src/api/compile.ts');
          const result = await mod.compileGherkin(gherkinContent);

          if (result.error) {
            res.statusCode = 422;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: result.error, issues: result.issues }));
            return;
          }

          // Build ZIP
          const JSZip = (await import('jszip')).default;
          const zip = new JSZip();
          for (const file of result.files) {
            zip.file(file.filename, file.xml);
          }
          const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `attachment; filename="${result.testcaseName || 'testsuite'}.zip"`);
          res.end(zipBuffer);
        } catch (e: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: `Compilation failed: ${e.message}` }));
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const db = getDbConfig(env);
  return {
  plugins: [react(), healthProxy(), itbProxy(), compileApi(), itbIdResolver(db)],
  // Use environment variable for base path, fallback to /test-workbench/ for GitHub Pages
  base: process.env.VITE_BASE_PATH || '/test-workbench/',
  optimizeDeps: {
    include: ['monaco-editor']
  },
  build: {
    rollupOptions: {
      external: [],
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js'
      }
    },
  },
  css: {
    postcss: './postcss.config.js'
  },
  server: {
    port: 3000,
    open: true,
    proxy: {}  // ITB proxy handled by itbProxy() plugin below
  },
  define: {
    global: 'globalThis',
  },
  worker: {
    format: 'es'
  }
};
})