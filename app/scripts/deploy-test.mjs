#!/usr/bin/env node
/**
 * Standalone deploy-test script.
 * Reads server.feature, parses it using the language catalog,
 * generates GITB TDL XML, ZIPs, and deploys to ITB.
 *
 * Usage: node scripts/deploy-test.mjs
 */
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import JSZip from 'jszip';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Config ──────────────────────────────────────────────────────────
const ITB_BASE = 'http://localhost:10003';
const ITB_DEPLOY_PATH = '/api/rest/testsuite/deploy';
const ITB_API_KEY = '2E86828DXEDB9X4C5CX8D5DX5BF0A406DAB9';
const ITB_SPEC_ID = '6DEAC9D3XB479X4A4CXADC5X68BA94006701';

// ── Load .env if present ────────────────────────────────────────────
try {
  const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
} catch {}

const BASE_URL = process.env.VITE_ITB_BASE_URL || ITB_BASE;
const DEPLOY_PATH = process.env.VITE_ITB_DEPLOY_PATH || ITB_DEPLOY_PATH;
const API_KEY = process.env.VITE_ITB_API_KEY || ITB_API_KEY;
const SPEC_ID = process.env.VITE_ITB_SPECIFICATION_ID || ITB_SPEC_ID;

// ── Step 1: Load catalog ────────────────────────────────────────────
const catalogText = fs.readFileSync(path.join(ROOT, 'public/lang/en.yml'), 'utf8');
const catalog = yaml.load(catalogText);

// ── Step 2: Parse server.feature ────────────────────────────────────
const featureText = fs.readFileSync(path.join(ROOT, 'public/features/server.feature'), 'utf8');

function stripInlineComments(raw) {
  let inDouble = false, inSingle = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '#' && !inDouble && !inSingle) return raw.slice(0, i);
  }
  return raw;
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}

function parseFeature(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let featureTitle = '', featureDescription = '', inFeaturePreamble = false;
  const backgroundSteps = [], scenarios = [];
  let currentTarget = null, currentScenarioName = '';
  const STEP_RE = /^(Given|When|Then|And|But)\s+(.*)$/i;
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = stripInlineComments(raw).trim();
    if (!line) { i++; continue; }
    if (/^Feature:/i.test(line)) {
      featureTitle = line.replace(/^Feature:\s*/i, '').trim();
      inFeaturePreamble = true;
      i++; continue;
    }
    if (/^Background:/i.test(line)) {
      inFeaturePreamble = false;
      currentTarget = backgroundSteps;
      i++; continue;
    }
    if (/^Scenario:/i.test(line)) {
      currentScenarioName = line.replace(/^Scenario:\s*/i, '').trim();
      const steps = [];
      scenarios.push({ name: currentScenarioName, steps });
      currentTarget = steps;
      inFeaturePreamble = false;
      i++; continue;
    }
    if (inFeaturePreamble) {
      if (featureDescription) featureDescription += ' ';
      featureDescription += line;
      i++; continue;
    }
    if (!currentTarget) { i++; continue; }
    const m = STEP_RE.exec(line);
    if (m) {
      const type = m[1], text = m[2].trim();
      const tableRows = [];
      let j = i + 1;
      while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) {
        const row = splitRow(stripInlineComments(lines[j]));
        if (tableRows.length === 0) {
          tableRows.push(Object.fromEntries(row.map(h => [h, h])));
        } else {
          const header = Object.keys(tableRows[0]);
          const obj = {};
          header.forEach((h, idx) => { obj[h] = row[idx] ?? ''; });
          tableRows.push(obj);
        }
        j++;
      }
      let table = tableRows.length > 1 ? tableRows.slice(1) : undefined;
      currentTarget.push({ type, text, line: i + 1, table });
      i = j; continue;
    }
    if (/^\s*#/.test(raw)) { i++; continue; }
    i++;
  }
  const builtScenarios = scenarios.map(s => ({
    name: s.name,
    steps: [...backgroundSteps, ...s.steps]
  }));
  return { featureTitle: featureTitle || 'Feature', featureDescription: featureDescription || featureTitle, scenarios: builtScenarios };
}

// ── Step 3: Expand steps to IR using catalog ────────────────────────
function expandStep(step, catalog) {
  for (const entry of catalog.steps) {
    const re = new RegExp(entry.match, 'i');
    const m = re.exec(step.text);
    if (!m) continue;
    const ctx = { groups: m.slice(1), tableRows: step.table || [], docString: '' };
    return materialize(entry.actions, ctx);
  }
  console.warn(`  ⚠ No mapping for: "${step.text}"`);
  return [];
}

function materialize(actions, ctx) {
  const out = [];
  if (!ctx._row && ctx.tableRows?.length > 0) {
    ctx._row = ctx.tableRows[0];
  }
  const subst = (v) =>
    typeof v === 'string'
      ? v.replace(/\$docString/g, () => ctx.docString ?? '')
           .replace(/\$([0-9]+)/g, (_, i) => ctx.groups[Number(i)-1] ?? '')
           .replace(/\$row\.([A-Za-z0-9_.]+)/g, (_, k) => ctx._row?.[k] ?? '')
      : v;

  const visit = (a) => {
    const clone = JSON.parse(JSON.stringify(a));
    if (clone.foreach) {
      for (const row of ctx.tableRows) {
        const before = ctx._row;
        ctx._row = row;
        clone.foreach.do.forEach(child => visit(child));
        ctx._row = before;
      }
      return;
    }
    if (clone.declareActor) {
      out.push({ type: 'declareActor', id: subst(clone.declareActor.id), name: subst(clone.declareActor.name ?? ''), role: subst(clone.declareActor.role ?? ''), endpoint: subst(clone.declareActor.endpoint ?? ''), canonical: subst(clone.declareActor.canonical ?? '') });
      return;
    }
    if (clone.call) {
      if (clone.call.inputs) for (const k in clone.call.inputs) clone.call.inputs[k] = subst(clone.call.inputs[k]);
      out.push({ type: 'call', path: clone.call.path, output: clone.call.output, from: subst(clone.call.from ?? ''), to: subst(clone.call.to ?? ''), inputs: clone.call.inputs });
      return;
    }
    if (clone.verify) {
      for (const k in clone.verify.inputs) clone.verify.inputs[k] = subst(clone.verify.inputs[k]);
      out.push({ type: 'verify', handler: clone.verify.handler, desc: clone.verify.desc, inputs: clone.verify.inputs });
      return;
    }
    if (clone.process) {
      for (const k in clone.process.inputs) clone.process.inputs[k] = subst(clone.process.inputs[k]);
      out.push({ type: 'process', handler: clone.process.handler, operation: clone.process.operation, output: clone.process.output, from: clone.process.from ? subst(clone.process.from) : undefined, to: clone.process.to ? subst(clone.process.to) : undefined, inputs: clone.process.inputs, hidden: clone.process.hidden });
      return;
    }
    if (clone.assign) {
      clone.assign.value = subst(clone.assign.value);
      out.push({ type: 'assign', to: subst(clone.assign.to), value: typeof clone.assign.value === 'string' ? clone.assign.value : JSON.stringify(clone.assign.value) });
      return;
    }
    if (clone.listAppend) {
      const item = {};
      for (const k in clone.listAppend.item) item[k] = subst(clone.listAppend.item[k]);
      out.push({ type: 'listAppend', list: subst(clone.listAppend.list), item });
      return;
    }
  };
  actions.forEach(visit);
  return out;
}

// ── Step 4: Generate XML (mirrors xmlGenerator.ts) ──────────────────
function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const escapeAttr = escapeXml;

function indentXml(s, spaces = 2) {
  const pad = ' '.repeat(spaces);
  return s.split('\n').map(line => line.length ? pad + line : line).join('\n');
}

function toId(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base.length ? base : 'tc-1';
}

function collectActors(ir) {
  const actors = [], seen = new Set();
  for (const a of ir) {
    if (a.type === 'declareActor' && !seen.has(a.id)) {
      seen.add(a.id);
      actors.push({ id: a.id, name: a.name, role: a.role, endpoint: a.endpoint, canonical: a.canonical });
    }
  }
  if (actors.length === 0) {
    actors.push({ id: 'Client', role: 'SUT' });
    actors.push({ id: 'FHIRServer', role: 'infra' });
  }
  return actors;
}

function gitbRoleAttr(role) {
  if (role === 'SUT') return ' role="SUT"';
  if (role === 'infra') return ' role="SIMULATED"';
  return '';
}

function emitActors(actors) {
  return actors.map(a => {
    if (a.endpoint) {
      return `<gitb:actor id="${escapeAttr(a.id)}"${gitbRoleAttr(a.role)}>\n  <gitb:endpoint>${escapeXml(a.endpoint)}</gitb:endpoint>\n</gitb:actor>`;
    }
    return `<gitb:actor id="${escapeAttr(a.id)}"${gitbRoleAttr(a.role)}/>`;
  }).join('\n');
}

function emitSuiteActors(actors) {
  return actors.map(a => {
    const name = a.name || a.id;
    const desc = a.endpoint
      ? `Endpoint: ${a.endpoint}${a.canonical ? ' | Definition: ' + a.canonical : ''}`
      : (a.canonical ? `Definition: ${a.canonical}` : '');
    return `<gitb:actor id="${escapeAttr(a.id)}">\n  <gitb:name>${escapeXml(name)}</gitb:name>${desc ? `\n  <gitb:desc>${escapeXml(desc)}</gitb:desc>` : ''}\n</gitb:actor>`;
  }).join('\n');
}

function quoteIfLiteral(v) {
  if (!v) return v;
  if (v.startsWith('"') || v.startsWith("'") || v.startsWith('$')) return v;
  if (/^[0-9]+(\.[0-9]+)?$/.test(v)) return v;
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) return v;
  if (v === 'true' || v === 'false') return v;
  return `"${v}"`;
}

function emitInputs(inputs) {
  if (!inputs) return [];
  return Object.entries(inputs).map(([k, v]) => `  <input name="${escapeAttr(k)}">${escapeXml(quoteIfLiteral(v))}</input>`);
}

function emitIR(ir) {
  const out = [];
  for (const a of ir) {
    if (a.type === 'declareActor') continue;
    if (a.type === 'call') {
      out.push(`<call path="${escapeAttr(a.path)}"${a.output ? ` output="${escapeAttr(a.output)}"` : ''}>`);
      if (a.from) out.push(`  <input name="from">${escapeXml(a.from)}</input>`);
      if (a.to) out.push(`  <input name="to">${escapeXml(a.to)}</input>`);
      out.push(...emitInputs(a.inputs));
      out.push(`</call>`);
    } else if (a.type === 'verify') {
      out.push(`<verify handler="${escapeAttr(a.handler)}"${a.desc ? ` desc="${escapeAttr(a.desc)}"` : ''}>`);
      out.push(...emitInputs(a.inputs));
      out.push(`</verify>`);
    } else if (a.type === 'process') {
      out.push(`<process handler="${escapeAttr(a.handler)}" operation="${escapeAttr(a.operation)}"${a.output ? ` output="${escapeAttr(a.output)}"` : ''}${a.hidden ? ` hidden="true"` : ''}>`);
      if (a.from) out.push(`  <input name="from">${escapeXml(a.from)}</input>`);
      if (a.to) out.push(`  <input name="to">${escapeXml(a.to)}</input>`);
      out.push(...emitInputs(a.inputs));
      out.push(`</process>`);
    } else if (a.type === 'assign') {
      if (a.value === '[]' || a.value === '') continue;
      out.push(`<assign to="${escapeAttr(a.to)}">${escapeXml(a.value)}</assign>`);
    } else if (a.type === 'listAppend') {
      const jsonStr = JSON.stringify(a.item).replace(/'/g, "\\'");
      out.push(`<assign to="${escapeAttr(a.list)}" append="true">'${escapeXml(jsonStr)}'</assign>`);
    }
  }
  return out.join('\n');
}

function collectScriptletCalls(ir) {
  const calls = new Map();
  for (const a of ir) {
    if (a.type === 'call' && a.path.startsWith('scriptlets/')) {
      const existing = calls.get(a.path) || new Set();
      if (a.from) existing.add('from');
      if (a.to) existing.add('to');
      if (a.inputs) for (const k of Object.keys(a.inputs)) existing.add(k);
      calls.set(a.path, existing);
    }
  }
  return calls;
}

function generateScriptlets(scenarios) {
  const allCalls = new Map();
  for (const sc of scenarios) {
    for (const [p, inputs] of collectScriptletCalls(sc.ir)) {
      const existing = allCalls.get(p) || new Set();
      for (const k of inputs) existing.add(k);
      allCalls.set(p, existing);
    }
  }
  const files = [];
  for (const [p, inputNames] of allCalls) {
    const scriptletId = p.replace(/^scriptlets\//, '').replace(/\.xml$/, '');
    const inputsXml = [...inputNames].map(name => `    <var name="${escapeAttr(name)}" type="string"/>`).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<scriptlet id="${escapeAttr(scriptletId)}"
            xmlns="http://www.gitb.com/tdl/v1/"
            xmlns:gitb="http://www.gitb.com/core/v1/">
  <params>
${inputsXml}
  </params>
  <steps>
    <log>"Scriptlet ${escapeXml(scriptletId)} executed (stub)."</log>
  </steps>
</scriptlet>`;
    files.push({ filename: p, xml, type: 'scriptlet', id: scriptletId, name: scriptletId });
  }
  return files;
}

function generateXML(featureTitle, featureDescription, scenarioIRs) {
  const files = [];

  for (const sc of scenarioIRs) {
    const testcaseId = toId(sc.name);
    const actors = collectActors(sc.ir);
    const stepsXml = emitIR(sc.ir);
    const actorsXml = emitActors(actors);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testcase id="${escapeAttr(testcaseId)}"
          xmlns="http://www.gitb.com/tdl/v1/"
          xmlns:gitb="http://www.gitb.com/core/v1/">
  <metadata>
    <gitb:name>${escapeXml(sc.name)}</gitb:name>
    <gitb:version>1.0</gitb:version>
    <gitb:description>${escapeXml(featureTitle)}</gitb:description>
  </metadata>

  <actors>
${indentXml(actorsXml, 4)}
  </actors>

  <steps stopOnError="true">
${indentXml(stepsXml || '<!-- no steps -->', 4)}
  </steps>

  <output>
    <success>
      <default>"Test case completed successfully."</default>
    </success>
    <failure>
      <default>"Test case failed. Check step reports and logs."</default>
    </failure>
  </output>
</testcase>`;
    files.push({ filename: `${testcaseId}.xml`, xml, type: 'testcase', id: testcaseId, name: sc.name });
  }

  // Test suite
  const suiteId = toId(featureTitle);
  const testcaseRefs = files.filter(f => f.type === 'testcase').map(f => `  <testcase id="${escapeAttr(f.id)}"/>`).join('\n');
  const allActors = new Map();
  for (const sc of scenarioIRs) {
    for (const a of collectActors(sc.ir)) {
      if (!allActors.has(a.id)) allActors.set(a.id, { name: a.name, role: a.role, endpoint: a.endpoint, canonical: a.canonical });
    }
  }
  const suiteActorsXml = emitSuiteActors([...allActors.entries()].map(([id, v]) => ({ id, ...v })));

  const suiteXml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite id="${escapeAttr(suiteId)}"
           xmlns="http://www.gitb.com/tdl/v1/"
           xmlns:gitb="http://www.gitb.com/core/v1/">
  <metadata>
    <gitb:name>${escapeXml(featureTitle)}</gitb:name>
    <gitb:version>1.0</gitb:version>
    <gitb:description>${escapeXml(featureDescription)}</gitb:description>
  </metadata>

  <actors>
${indentXml(suiteActorsXml, 4)}
  </actors>

${testcaseRefs}

</testsuite>`;

  files.unshift({ filename: `${suiteId}.xml`, xml: suiteXml, type: 'testsuite', id: suiteId, name: featureTitle });

  // Scriptlets
  const scriptletFiles = generateScriptlets(scenarioIRs);
  files.push(...scriptletFiles);

  return files;
}

// ── Step 5: Build ZIP and deploy ────────────────────────────────────
async function buildZip(files) {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.filename, f.xml);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function deploy(zipBuffer) {
  const url = `${BASE_URL}${DEPLOY_PATH}`;
  console.log(`\n📤 Deploying to ${url}...`);

  const boundary = '----FormBoundary' + Date.now();

  // Build multipart form data manually
  const parts = [];

  // updateSpecification field
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="updateSpecification"\r\n\r\ntrue`);

  // specification field
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="specification"\r\n\r\n${SPEC_ID}`);

  // testSuite file field
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="testSuite"; filename="testsuite.zip"\r\nContent-Type: application/zip\r\n\r\n`);

  const preamble = Buffer.from(parts.join('\r\n') + '\r\n', 'utf8');
  // We need to handle binary data for the zip, so build body manually
  const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

  const form = new globalThis.FormData();
  form.append('updateSpecification', 'true');
  form.append('specification', SPEC_ID);
  form.append('testSuite', new Blob([zipBuffer], { type: 'application/zip' }), 'testsuite.zip');

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'ITB_API_KEY': API_KEY },
    body: form,
  });

  const contentType = resp.headers.get('content-type') || '';
  let body;
  if (contentType.includes('json')) {
    body = await resp.json();
  } else {
    body = await resp.text();
  }

  return { status: resp.status, ok: resp.ok, body };
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log('🔧 Parsing server.feature...');
  const { featureTitle, featureDescription, scenarios } = parseFeature(featureText);
  console.log(`   Feature: "${featureTitle}" (${scenarios.length} scenarios)`);

  console.log('📋 Expanding steps using catalog...');
  const scenarioIRs = [];
  for (const sc of scenarios) {
    const ir = [];
    for (const step of sc.steps) {
      const actions = expandStep(step, catalog);
      ir.push(...actions);
    }
    scenarioIRs.push({ name: sc.name, ir });
    console.log(`   ${sc.name}: ${ir.length} IR actions`);
  }

  console.log('📝 Generating XML...');
  const files = generateXML(featureTitle, featureDescription, scenarioIRs);
  console.log(`   Generated ${files.length} files:`);
  for (const f of files) {
    console.log(`     ${f.type}: ${f.filename}`);
  }

  // Write files to disk for inspection
  const outDir = path.join(ROOT, 'scripts', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of files) {
    const fp = path.join(outDir, f.filename);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, f.xml);
  }
  console.log(`   Written to scripts/out/`);

  console.log('📦 Building ZIP...');
  const zipBuffer = await buildZip(files);
  fs.writeFileSync(path.join(outDir, 'testsuite.zip'), zipBuffer);

  const result = await deploy(zipBuffer);
  console.log(`\n📬 Response: ${result.status}`);

  if (typeof result.body === 'object') {
    console.log(JSON.stringify(result.body, null, 2));

    if (result.body.completed === false || result.body.errors?.length) {
      console.log('\n❌ ERRORS:');
      for (const err of (result.body.errors || [])) {
        console.log(`  [${err.code}] ${err.description} in ${err.location || '?'}`);
      }
    }
    if (result.body.warnings?.length) {
      console.log('\n⚠️  WARNINGS:');
      for (const w of result.body.warnings) {
        console.log(`  [${w.code}] ${w.description} in ${w.location || '?'}`);
      }
    }
    if (result.body.completed === true) {
      console.log('\n✅ Deployed successfully!');
    }
  } else {
    console.log(String(result.body).substring(0, 500));
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
