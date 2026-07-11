// Authoring plugin server — ONE app: workbench SPA + test manager + ITB proxy.
// Zero npm dependencies (node:http only), so the runtime image needs no install.
//
//   /                      the Gherkin workbench SPA (built by the Dockerfile)
//   /manager               the test manager page (wraps itb-cli 1:1)
//   /api/health            liveness
//   /api/features          list *.feature files in $CLI_DIR/features
//   /api/feature?name=     GET content | POST save
//   /api/state             the CLI's resolved-keys state (.itb-state.json)
//   /api/cli   POST {cmd,args}  spawn `node bin/itb-suite.mjs <cmd>` (allowlisted)
//   /itb-proxy/<enc-base>/path  same contract as the workbench's Vite dev proxy
//   /api/health-proxy?url=&method=   same contract as the Vite dev health proxy
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8000);
const CLI = process.env.CLI_DIR ?? '/cli';
const DIST = path.join(here, 'dist');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json',
  '.wasm': 'application/wasm', '.yml': 'text/yaml', '.yaml': 'text/yaml',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.feature': 'text/plain', '.md': 'text/plain', '.xml': 'application/xml',
};

// watch is deliberately NOT allowed (long-running; use it from a terminal)
const ALLOWED = { compile: 'bin/itb-suite.mjs', init: 'bin/itb-suite.mjs', deploy: 'bin/itb-suite.mjs', undeploy: 'bin/itb-suite.mjs', run: 'bin/itb-suite.mjs', status: 'bin/itb-suite.mjs', browse: 'bin/itb-suite.mjs', testplan: 'bin/itb-suite.mjs', e2e: 'test/e2e.mjs' };

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}
function safeFeatureName(name) {
  return typeof name === 'string' && /^[\w][\w .-]*\.feature$/.test(name) && !name.includes('..');
}

function serveStatic(res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  let file = path.join(DIST, rel);
  if (!file.startsWith(DIST)) return send(res, 403, { error: 'forbidden' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(rel)) return send(res, 404, { error: 'not found' });
    file = path.join(DIST, 'index.html');            // SPA fallback
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

async function proxyItb(req, res) {
  const afterPrefix = (req.url ?? '/').replace(/^\/itb-proxy\//, '');
  const slashIdx = afterPrefix.indexOf('/');
  if (slashIdx < 0) return send(res, 400, { error: 'Missing target base in path' });
  const targetBase = decodeURIComponent(afterPrefix.substring(0, slashIdx));
  const targetUrl = `${targetBase.replace(/\/+$/, '')}${afterPrefix.substring(slashIdx)}`;
  try {
    const body = await readBody(req);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const fwdHeaders = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (['host', 'x-itb-target', 'connection', 'content-length'].includes(k)) continue;
      if (typeof v === 'string') fwdHeaders[k] = v;
    }
    const resp = await fetch(targetUrl, {
      method: req.method ?? 'GET', headers: fwdHeaders,
      body: body.length > 0 ? body : undefined,
      signal: controller.signal, duplex: body.length > 0 ? 'half' : undefined,
    });
    clearTimeout(timeout);
    const respBody = Buffer.from(await resp.arrayBuffer());
    const headers = {};
    for (const [k, v] of resp.headers.entries()) if (k !== 'transfer-encoding' && k !== 'content-encoding') headers[k] = v;
    res.writeHead(resp.status, headers);
    res.end(respBody);
  } catch (err) {
    send(res, 502, { error: err?.message ?? 'proxy error' });
  }
}

function runCli(cmd, args = []) {
  return new Promise((resolve) => {
    const script = ALLOWED[cmd];
    const argv = cmd === 'e2e' ? [script] : [script, cmd, ...args.map(String)];
    const child = spawn('node', argv, { cwd: CLI, env: process.env });
    let output = '';
    const cap = (d) => { output += d.toString(); if (output.length > 400000) output = output.slice(-400000); };
    child.stdout.on('data', cap); child.stderr.on('data', cap);
    const killer = setTimeout(() => { child.kill('SIGKILL'); output += '\n[killed: 15 min timeout]'; }, 15 * 60 * 1000);
    child.on('close', (code) => { clearTimeout(killer); resolve({ code, output }); });
    child.on('error', (err) => { clearTimeout(killer); resolve({ code: -1, output: String(err) }); });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const p = url.pathname;
  try {
    if (p === '/api/health') return send(res, 200, { ok: true, cli: fs.existsSync(path.join(CLI, 'bin/itb-suite.mjs')) });
    if (p === '/manager') return send(res, 200, fs.readFileSync(path.join(here, 'manager.html'), 'utf8'), 'text/html');
    if (p.startsWith('/itb-proxy/')) return proxyItb(req, res);
    if (p === '/api/health-proxy') {
      const target = url.searchParams.get('url');
      if (!target) return send(res, 400, { error: 'Missing url parameter' });
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 5000);
        const r = await fetch(target, { method: url.searchParams.get('method') ?? 'GET', signal: controller.signal });
        clearTimeout(t);
        return send(res, 200, { status: r.status });
      } catch (err) { return send(res, 200, { status: 0, error: err?.message ?? 'unreachable' }); }
    }
    if (p === '/api/features') {
      const dir = path.join(CLI, 'features');
      const list = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.feature')) : [];
      return send(res, 200, list);
    }
    if (p === '/api/feature') {
      const name = url.searchParams.get('name');
      if (!safeFeatureName(name)) return send(res, 400, { error: 'bad feature name' });
      const file = path.join(CLI, 'features', name);
      if (req.method === 'POST') {
        fs.writeFileSync(file, await readBody(req));
        return send(res, 200, { saved: name });
      }
      if (!fs.existsSync(file)) return send(res, 404, { error: 'not found' });
      return send(res, 200, fs.readFileSync(file, 'utf8'), 'text/plain');
    }
    if (p === '/api/state') {
      const f = path.join(CLI, '.itb-state.json');
      return send(res, 200, fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '{}');
    }
    if (p === '/api/cli' && req.method === 'POST') {
      let payload = {};
      try { payload = JSON.parse((await readBody(req)).toString() || '{}'); } catch { /* empty */ }
      const { cmd, args } = payload;
      if (!ALLOWED[cmd]) return send(res, 400, { error: `cmd must be one of: ${Object.keys(ALLOWED).join(', ')}` });
      // no shell is involved (spawn argv), so this only guards against garbage;
      // #, ?, &, % appear in package refs (name#version) and URLs
      const safeArgs = Array.isArray(args) ? args.filter(a => /^[\w=@:.,#?&%~+/\\ -]*$/.test(String(a))).slice(0, 8) : [];
      return send(res, 200, await runCli(cmd, safeArgs));
    }
    if (req.method === 'GET') return serveStatic(res, p);
    send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, 500, { error: err?.message ?? 'server error' });
  }
});
server.listen(PORT, () => console.log(`authoring plugin: workbench at :${PORT}/, manager at :${PORT}/manager (CLI_DIR=${CLI})`));
