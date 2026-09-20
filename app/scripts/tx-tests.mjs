#!/usr/bin/env node
// Turns the HL7 FHIR terminology-ecosystem test set into ITB Gherkin features:
// one feature per upstream suite, one scenario per test.
//
//   node scripts/tx-tests.mjs --source <tests folder> [options]
//
//   --source <dir>     a checkout of https://github.com/HL7/fhir-tx-ecosystem-ig, its tests/ folder
//   --out <dir>        where the features go           (default public/features/tx-ecosystem)
//   --commit <sha>     the upstream commit the material is fetched from at run time
//                      (default: the checkout's HEAD, else "main")
//   --material <url>   where the test material is fetched from at run time
//                      (default: raw GitHub at --commit)
//   --server <url>     the terminology server under test
//   --validator <url>  the FHIR validator that runs the matchetype comparison
//   --fhir-version <v> the FHIR version the server speaks, 4.0 or 5.0 (default 4.0); tests bound to another version are left out
//   --suite <name>     only this suite (repeatable)
//
// Upstream, a test is: operation, request (Parameters), expected response (a
// matchetype), and a few modifiers. The feature says the same thing in the
// dialect's words; the request is inlined as the reader would want to see it,
// with the runner's profile parameters (uuid, version handling) merged in.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const flag = name => args.includes(name);
const suites = args.flatMap((a, i) => a === '--suite' ? [args[i + 1]] : []);

const source = opt('--source');
if (!source) { console.error('--source <tests folder> is required'); process.exit(2); }
const out = opt('--out', path.join(appDir, 'public', 'features', 'tx-ecosystem'));
const server = opt('--server', 'https://178.104.103.200.sslip.io/tx/r4');
const validator = opt('--validator', 'http://fhir-validator:8080');
const fhirVersion = opt('--fhir-version', '4.0');
// Upstream binds a test to a server version with "version": "4.0", "5.0" or "!4.0".
const appliesToVersion = t => !t.version || (t.version.startsWith('!') ? t.version.slice(1) !== fhirVersion : t.version === fhirVersion);

let commit = opt('--commit');
if (!commit) {
  try { commit = execSync('git rev-parse HEAD', { cwd: source, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { commit = 'main'; }
}
const material = opt('--material', `https://raw.githubusercontent.com/HL7/fhir-tx-ecosystem-ig/${commit}/tests/`);

const cases = JSON.parse(fs.readFileSync(path.join(source, 'test-cases.json'), 'utf8'));
const readJson = rel => JSON.parse(fs.readFileSync(path.join(source, rel), 'utf8'));
const defaultProfile = readJson('parameters-default.json');

// ---------------------------------------------------------------------------
// The words for each upstream operation.
// ---------------------------------------------------------------------------
const OPS = {
  'expand':           { rule: 'ValueSet $expand',                 step: 'Client expands on TxServer with:' },
  'validate-code':    { rule: 'ValueSet $validate-code',          step: 'Client validates a code on TxServer with:' },
  'cs-validate-code': { rule: 'CodeSystem $validate-code',        step: 'Client validates a code against the code system on TxServer with:' },
  'lookup':           { rule: 'CodeSystem $lookup',               step: 'Client looks up a code on TxServer with:' },
  'subsumes':         { rule: 'CodeSystem $subsumes',             step: 'Client tests subsumption on TxServer with:' },
  'translate':        { rule: 'ConceptMap $translate',            step: 'Client translates on TxServer with:' },
  'compare':          { rule: 'ValueSet $compare',                step: 'Client compares value sets on TxServer with:' },
  'batch-validate':   { rule: 'ValueSet $batch-validate-code',    step: 'Client validates a batch on TxServer with:' },
  'metadata':         { rule: 'Capability statement',             step: 'Client reads the capability statement of TxServer as $capabilities', get: true },
  'term-caps':        { rule: 'Terminology capabilities',         step: 'Client reads the terminology capabilities of TxServer as $capabilities', get: true },
};

// ---------------------------------------------------------------------------
// JSON the way a reader wants it: one parameter per line where it fits.
// ---------------------------------------------------------------------------
function inline(v) {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  if (v && typeof v === 'object') return `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }`;
  return JSON.stringify(v);
}
function formatParameters(p, indent) {
  const pad = ' '.repeat(indent);
  const lines = [`${pad}{`, `${pad}  "resourceType": "Parameters",`];
  const rest = Object.entries(p).filter(([k]) => k !== 'resourceType' && k !== 'parameter');
  for (const [k, v] of rest) lines.push(`${pad}  ${JSON.stringify(k)}: ${inline(v)},`);
  const params = p.parameter ?? [];
  lines.push(`${pad}  "parameter": [`);
  params.forEach((param, i) => {
    const one = inline(param);
    const comma = i < params.length - 1 ? ',' : '';
    if (one.length + indent <= 110) lines.push(`${pad}    ${one}${comma}`);
    else lines.push(JSON.stringify(param, null, 2).split('\n').map(l => `${pad}    ${l}`).join('\n') + comma);
  });
  lines.push(`${pad}  ]`, `${pad}}`);
  // A doc string becomes a TDL string literal in single quotes: keep the
  // apostrophe out of it. JSON reads the \u0027 escape as the same character.
  return lines.join('\n').replace(/'/g, '\\u0027');
}

// The runner appends the profile parameters to every request. Say so in the
// request itself, so the reader sees what the server receives.
function requestFor(test) {
  const req = readJson(test.request);
  const profile = test.profile ? readJson(test.profile) : defaultProfile;
  req.parameter = [...(req.parameter ?? []), ...(profile.parameter ?? [])];
  if (test['lenient-display'] !== undefined) {
    req.parameter.push({ name: 'lenient-display-validation', valueBoolean: !!test['lenient-display'] });
  }
  return req;
}

const wrap = (text, width = 96) => {
  const words = String(text).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > width) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
};
const comment = (indent, text) => wrap(text).map(l => `${' '.repeat(indent)}# ${l}`);

// ---------------------------------------------------------------------------
function feature(suite) {
  const L = [];
  const tests = (suite.tests ?? []).filter(appliesToVersion);
  const leftOut = (suite.tests ?? []).filter(t => !appliesToVersion(t));
  const byOp = new Map();
  for (const t of tests) { if (!byOp.has(t.operation)) byOp.set(t.operation, []); byOp.get(t.operation).push(t); }

  L.push(`# Generated by scripts/tx-tests.mjs from the HL7 FHIR terminology-ecosystem tests`);
  L.push(`# (https://github.com/HL7/fhir-tx-ecosystem-ig, tests/test-cases.json at ${commit}).`);
  L.push(`# Suite "${suite.name}": ${tests.length} tests for a FHIR ${fhirVersion} server. Do not edit; re-run the generator.`);
  if (leftOut.length) L.push(`# Left out, bound to another FHIR version: ${leftOut.map(t => `${t.name} (${t.version})`).join(', ')}.`);
  L.push(`#`);
  L.push(`# Each scenario is one upstream test: the request is the upstream Parameters with the`);
  L.push(`# runner's profile parameters merged in, and the expected response is the upstream file,`);
  L.push(`# fetched at run time and compared as a matchetype by the FHIR validator.`);
  const tags = ['@lang:itb-core-en@^2', '@dialect:fhir-terminology@^1', '@dialect:fhir-validator@^2', `@suite:${suite.name}`];
  if (suite.mode) tags.push(`@mode:${suite.mode}`);
  L.push(tags.join(' '));
  L.push(`Feature: Terminology server — ${suite.name}`);
  for (const l of wrap(suite.description ?? '')) L.push(`  ${l}`);
  if (suite.mode && suite.mode !== 'general') L.push(`  Upstream mode "${suite.mode}": a server is expected to pass this suite only when it supports it.`);
  for (const k of ['mode-note', 'notes', 'todo']) if (suite[k]) for (const l of wrap(`${k === 'todo' ? 'Upstream to-do: ' : ''}${suite[k]}`)) L.push(`  ${l}`);
  L.push('');
  L.push(`  Background:`);
  L.push(`    Given TxServer is the system under test at "${server}"`);
  L.push(`    And FHIRValidator is a fhir-validator at "${validator}"`);
  L.push(`    And Client is infrastructure`);
  L.push(`    And Client fetches the test material from "${material}"`);
  if (suite.setup?.length) {
    L.push(`    And TxServer is given the resources:`);
    const w = Math.max(...suite.setup.map(s => s.length), 8);
    L.push(`      | ${'resource'.padEnd(w)} |`);
    for (const s of suite.setup) L.push(`      | ${s.padEnd(w)} |`);
  }

  const seen = new Map();
  for (const [op, list] of byOp) {
    const words = OPS[op];
    if (!words) throw new Error(`unknown operation ${op} in suite ${suite.name}`);
    L.push('');
    L.push(`  Rule: ${words.rule}`);
    for (const t of list) {
      L.push('');
      if (t.description && t.description !== 'to be provided') L.push(...comment(4, t.description));
      if (t.explanation) L.push(...comment(4, t.explanation));
      const stags = [`@operation:${op}`];
      if (t.mode) stags.push(`@mode:${t.mode}`);
      if (t.version) stags.push(`@fhir-version:${t.version}`);
      if (t['full-set']) stags.push('@full-set');
      if (t['http-code']) stags.push(`@http-code:${t['http-code']}`);
      L.push(`    ${stags.join(' ')}`);
      let name = t.name; const n = (seen.get(name) ?? 0) + 1; seen.set(name, n); if (n > 1) name = `${name}-${n}`;
      L.push(`    Scenario: ${name}`);
      if (t['Accept-Language']) L.push(`      Given set header "Accept-Language" to "${t['Accept-Language']}"`);
      if (t.header) L.push(`      Given set header "${t.header.name}" to "${t.header.value}"`);
      if (words.get) {
        L.push(`      When ${words.step}`);
      } else {
        L.push(`      When ${words.step}`);
        L.push(`        """`);
        L.push(formatParameters(requestFor(t), 8));
        L.push(`        """`);
      }
      if (t['http-code']) {
        L.push(`      Then $response.status should match "^${String(t['http-code']).replace(/x+$/i, '')}"`);
      } else {
        L.push(`      Then $response.status should be 200`);
      }
      const subject = words.get ? '$capabilities' : '$response';
      // Upstream accepts more than one answer for some tests: the flat form of
      // an expansion, tx.fhir.org's own, or a second error shape. List them all;
      // one match is enough.
      const alternatives = [t.response, t['response:flat'], t['response:tx.fhir.org'], t.response2].filter(Boolean);
      if (alternatives.length === 1) {
        L.push(`      And ${subject} should match the expected response "${alternatives[0]}"`);
      } else {
        L.push(`      And ${subject} should match one of the expected responses:`);
        const w = Math.max(...alternatives.map(a => a.length), 8);
        L.push(`        | ${'response'.padEnd(w)} |`);
        for (const a of alternatives) L.push(`        | ${a.padEnd(w)} |`);
      }
    }
  }
  L.push('');
  return L.join('\n');
}

fs.mkdirSync(out, { recursive: true });
let files = 0, count = 0;
for (const suite of cases.suites) {
  if (suites.length && !suites.includes(suite.name)) continue;
  const file = path.join(out, `tx-${suite.name}.feature`);
  fs.writeFileSync(file, feature(suite));
  files++; count += suite.tests.filter(appliesToVersion).length;
}
console.log(`${files} features, ${count} scenarios → ${path.relative(process.cwd(), out)} (material ${material})`);
