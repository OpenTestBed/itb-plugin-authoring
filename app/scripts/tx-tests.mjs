#!/usr/bin/env node
// Turns the HL7 FHIR terminology-ecosystem test set into ITB Gherkin features:
// one feature per upstream suite, one scenario per test.
//
//   node scripts/tx-tests.mjs --source <tests folder> [options]
//
//   --source <dir>     a checkout of https://github.com/HL7/fhir-tx-ecosystem-ig, its tests/ folder
//   --out <dir>        where the features go           (default public/features/tx-ecosystem)
//   --commit <sha>     pin the material to one upstream commit instead of the "main" branch
//   --material <url>   where the test material is fetched from at run time
//                      (default: raw GitHub at --commit)
//   --server <url>     the terminology server under test
//   --validator <url>  the FHIR validator that runs the matchetype comparison
//   --fhir-version <v> the FHIR version the server speaks, 4.0 or 5.0 (default 4.0); tests bound to another version are left out
//   --suite <name>     only this suite (repeatable)
//   --no-merged        do not write tx-all.feature
//
// Two shapes come out of the same model, because ITB stores one test suite
// per feature file:
//   tx-<suite>.feature   one file per upstream suite - 38 suites in ITB
//   tx-all.feature       the whole set in one file - ONE suite of 1182 test
//                        cases. Each scenario names its own resources there,
//                        because a Background belongs to the whole file and
//                        these suites do not share one.
//
// Upstream, a test is: operation, request (Parameters), expected response (a
// matchetype), and a few modifiers. The feature says the same thing in the
// dialect's words; the request is inlined as the reader would want to see it,
// with the runner's profile parameters (uuid, version handling) merged in.
import fs from 'node:fs';
import path from 'node:path';
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

// The IG lives at https://github.com/HL7/fhir-tx-ecosystem-ig; its tests/ folder
// is what a run reads. Follow "main" unless a commit is pinned with --commit.
const commit = opt('--commit', 'main');
const material = opt('--material', `https://raw.githubusercontent.com/HL7/fhir-tx-ecosystem-ig/${commit}/tests/`);

const cases = JSON.parse(fs.readFileSync(path.join(source, 'test-cases.json'), 'utf8'));

/** A suite's name as a file/id fragment: lowercase, only letters, digits, hyphens. */
export const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(source, rel), 'utf8'));
const defaultProfile = readJson('parameters-default.json');

// ---------------------------------------------------------------------------
// The words for each upstream operation.
// ---------------------------------------------------------------------------
const OPS = {
  'expand':           { rule: 'ValueSet $expand',              verb: 'expands on' },
  'validate-code':    { rule: 'ValueSet $validate-code',       verb: 'validates a code on' },
  'cs-validate-code': { rule: 'CodeSystem $validate-code',     verb: 'validates a code against the code system on' },
  'lookup':           { rule: 'CodeSystem $lookup',            verb: 'looks up a code on' },
  'subsumes':         { rule: 'CodeSystem $subsumes',          verb: 'tests subsumption on' },
  'translate':        { rule: 'ConceptMap $translate',         verb: 'translates on' },
  'compare':          { rule: 'ValueSet $compare',             verb: 'compares value sets on' },
  'batch-validate':   { rule: 'ValueSet $batch-validate-code', verb: 'validates a batch on' },
  // partial: the expected files for these two state the minimum a server must
  // declare, not its whole capability statement, which is how the runner
  // compares them.
  'metadata':          { rule: 'Capability statement',     step: 'Client reads the capability statement of TxServer as $capabilities', get: true, partial: true },
  'term-caps':         { rule: 'Terminology capabilities', step: 'Client reads the terminology capabilities of TxServer as $capabilities', get: true, partial: true },
};
for (const o of Object.values(OPS)) if (o.verb) o.step = `Client ${o.verb} TxServer with:`;

/**
 * An ITB expression carries no backslash at all (TDL-042), and a JSON payload
 * written into a feature ends up inside one. A payload holding an apostrophe
 * (which would close the literal) or any JSON escape therefore cannot be
 * inlined: the test names the upstream file instead and the dialect fetches it.
 */
const inlinable = json => !/['\\]/.test(json);

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
  // Returned as it stands. inlinable() decides whether a payload can live in a
  // TDL literal at all, and one it rejects is named rather than rewritten.
  return lines.join('\n');
}

// The runner appends the profile parameters to every request. Say so in the
// request itself, so the reader sees what the server receives.
const profileOf = test => test.profile ?? 'parameters-default.json';

function requestFor(test) {
  const req = readJson(test.request);
  const profile = readJson(profileOf(test));
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

/**
 * One test as Gherkin at the given indent. `resources` is the suite's setup
 * list, written into the scenario when the file holds more than one suite.
 */
function scenarioLines(t, name, indent, resources) {
  const pad = ' '.repeat(indent);
  const words = OPS[t.operation];
  if (!words) throw new Error(`unknown operation ${t.operation} for ${t.name}`);
  const L = [];
  if (t.description && t.description !== 'to be provided') L.push(...comment(indent, t.description));
  if (t.explanation) L.push(...comment(indent, t.explanation));
  const tags = [`@operation:${t.operation}`];
  if (t.mode) tags.push(`@mode:${t.mode}`);
  if (t.version) tags.push(`@fhir-version:${t.version}`);
  if (t['full-set']) tags.push('@full-set');
  if (t['http-code']) tags.push(`@http-code:${t['http-code']}`);
  L.push(`${pad}${tags.join(' ')}`);
  L.push(`${pad}Scenario: ${name}`);
  if (resources?.length) {
    L.push(`${pad}  Given TxServer is given the resources:`);
    const w = Math.max(...resources.map(r => r.length), 8);
    L.push(`${pad}    | ${'resource'.padEnd(w)} |`);
    for (const r of resources) L.push(`${pad}    | ${r.padEnd(w)} |`);
  }
  if (t['Accept-Language']) L.push(`${pad}  Given set header "Accept-Language" to "${t['Accept-Language']}"`);
  if (t.header) L.push(`${pad}  Given set header "${t.header.name}" to "${t.header.value}"`);
  if (words.get) {
    L.push(`${pad}  When ${words.step}`);
  } else {
    const json = formatParameters(requestFor(t), indent + 4);
    if (inlinable(json)) {
      L.push(`${pad}  When ${words.step}`);
      L.push(`${pad}    """`);
      L.push(json);
      L.push(`${pad}    """`);
    } else {
      // Named, not written out. Say why, or the next reader will "fix" it.
      L.push(`${pad}  # The request holds a character an ITB expression cannot carry, so it is`);
      L.push(`${pad}  # fetched from the test material rather than written out here.`);
      if (t['lenient-display'] !== undefined) {
        throw new Error(`${t.name}: lenient-display is merged into the request, which this test cannot inline`);
      }
      L.push(`${pad}  When Client ${words.verb} TxServer with the request in "${t.request}" and the parameters in "${profileOf(t)}"`);
    }
  }
  L.push(t['http-code']
    ? `${pad}  Then $response.status should match "^${String(t['http-code']).replace(/x+$/i, '')}"`
    : `${pad}  Then $response.status should be 200`);
  const subject = words.get ? '$capabilities' : '$response';
  // Upstream accepts more than one answer for some tests: the flat form of an
  // expansion, tx.fhir.org's own, or a second error shape. One match is enough.
  const alternatives = [t.response, t['response:flat'], t['response:tx.fhir.org'], t.response2].filter(Boolean);
  const verb = words.partial ? 'should contain the pattern in' : 'should match the pattern in';
  if (alternatives.length === 1) {
    L.push(`${pad}  And ${subject} ${verb} "${alternatives[0]}"`);
  } else {
    L.push(`${pad}  And ${subject} should match one of the patterns in:`);
    const w = Math.max(...alternatives.map(a => a.length), 7);
    L.push(`${pad}    | ${'pattern'.padEnd(w)} |`);
    for (const a of alternatives) L.push(`${pad}    | ${a.padEnd(w)} |`);
  }
  return L;
}

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
  L.push(`# runner's profile parameters merged in, and the pattern is the upstream expected-response`);
  L.push(`# file, which is a matchetype — fetched at run time and compared by the FHIR validator.`);
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
    L.push('');
    L.push(`  Rule: ${OPS[op].rule}`);
    for (const t of list) {
      L.push('');
      let name = t.name; const n = (seen.get(name) ?? 0) + 1; seen.set(name, n); if (n > 1) name = `${name}-${n}`;
      L.push(...scenarioLines(t, name, 4, null));
    }
  }
  L.push('');
  return L.join('\n');
}

/**
 * The whole set as one feature, which ITB stores as ONE test suite holding
 * every test case. A `Rule:` per upstream suite keeps the grouping, and each
 * scenario carries its suite's resources: a Background is per file, and the
 * suites do not share one.
 */
function mergedFeature(suites) {
  const total = suites.reduce((n, s) => n + s.tests.length, 0);
  const L = [];
  L.push(`# Generated by scripts/tx-tests.mjs from the HL7 FHIR terminology-ecosystem tests`);
  L.push(`# (https://github.com/HL7/fhir-tx-ecosystem-ig, tests/test-cases.json at ${commit}).`);
  L.push(`# The whole set in one file: ${total} test cases in ${suites.length} suites, for a FHIR`);
  L.push(`# ${fhirVersion} server. Do not edit; re-run the generator.`);
  L.push(`#`);
  L.push(`# ITB stores one test suite per feature file, so this file is the whole test set`);
  L.push(`# as a single suite. The per-suite files beside it hold the same tests split 38`);
  L.push(`# ways; deploy either shape, not both.`);
  L.push(`#`);
  L.push(`# Each scenario names the resources its suite depends on, which travel with the`);
  L.push(`# request as tx-resource parameters. That repeats per test case, which is what`);
  L.push(`# already happens at run time: a Background runs once per test case too.`);
  L.push(`@lang:itb-core-en@^2 @dialect:fhir-terminology@^1 @dialect:fhir-validator@^2 @suite:all`);
  // The feature title becomes the ITB test suite's identifier and its name, so
  // it is the name the suite is known by rather than a sentence.
  L.push(`Feature: tx-tests-full`);
  L.push(`  Every test case of the HL7 terminology-ecosystem test set, in the suites the set`);
  L.push(`  defines: ${total} of them, for a FHIR ${fhirVersion} server. A suite whose upstream mode is`);
  L.push(`  not "general" is expected only of a server that supports that mode.`);
  L.push('');
  L.push(`  Background:`);
  L.push(`    Given TxServer is the system under test at "${server}"`);
  L.push(`    And FHIRValidator is a fhir-validator at "${validator}"`);
  L.push(`    And Client is infrastructure`);
  L.push(`    And Client fetches the test material from "${material}"`);

  const seen = new Map();
  for (const suite of suites) {
    if (!suite.tests.length) continue;
    L.push('');
    const notes = [
      suite.description ? `${suite.description[0].toUpperCase()}${suite.description.slice(1)}.` : '',
      suite.mode && suite.mode !== 'general' ? `Upstream mode "${suite.mode}".` : '',
      suite['mode-note'] || '',
    ].filter(Boolean).join(' ');
    if (notes) L.push(...comment(2, notes));
    L.push(`  Rule: ${suite.name}`);
    for (const t of suite.tests) {
      L.push('');
      // A handful of test names repeat across suites; ITB needs one id per
      // test case, so those carry their suite.
      let name = t.name;
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      if (n > 1) name = `${suite.name}-${t.name}`;
      L.push(...scenarioLines(t, name, 4, suite.setup));
    }
  }
  L.push('');
  return L.join('\n');
}

fs.mkdirSync(out, { recursive: true });
let files = 0, count = 0;
for (const suite of cases.suites) {
  if (suites.length && !suites.includes(suite.name)) continue;
  const file = path.join(out, `tx-${slug(suite.name)}.feature`);
  fs.writeFileSync(file, feature(suite));
  files++; count += suite.tests.filter(appliesToVersion).length;
}
// The same tests as one file, for deploying a single ITB suite.
const wanted = cases.suites.filter(s => (!suites.length || suites.includes(s.name)) && s.tests.some(appliesToVersion))
  .map(s => ({ ...s, tests: s.tests.filter(appliesToVersion) }));
if (!flag('--no-merged')) {
  const mergedPath = path.join(out, 'tx-all.feature');
  fs.writeFileSync(mergedPath, mergedFeature(wanted));
  const kb = Math.round(fs.statSync(mergedPath).size / 1024);
  console.log(`  + tx-all.feature: the same ${count} scenarios as one suite (${kb} KB)`);
}
console.log(`${files} features, ${count} scenarios → ${path.relative(process.cwd(), out)} (material ${material})`);
