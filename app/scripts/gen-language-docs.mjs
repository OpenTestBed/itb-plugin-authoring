#!/usr/bin/env node
// Render every sentence of the language, core and dialects, as a readable
// example line, and write public/lang/EXPRESSIONS.md.
//
//   node scripts/gen-language-docs.mjs [--core <en.yml>] [--out <file.md>]
//
// The point of generating it: a sentence that exists in lang/en.yml but in no
// hand-written document is a sentence nobody can find. Regenerate after any
// change to the language or to a dialect's steps.yml.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '..');

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};

// The core language the app itself compiles against is the one inside the
// installed package (see src/api/compile.ts); the checkout beside this repo is
// only the fallback for a working tree where the package is not installed.
function coreLanguage() {
  try {
    const pkg = fileURLToPath(import.meta.resolve('@opentestbed/otb-gherkin'));
    const f = path.resolve(path.dirname(pkg), '../lang/en.yml');
    if (fs.existsSync(f)) return f;
  } catch { /* not installed */ }
  return path.resolve(app, '../../itb-cli/packages/gherkin/lang/en.yml');
}

const CORE = arg('core', coreLanguage());
const COMPONENTS = arg('components', path.join(app, 'public/components'));
const OUT = arg('out', path.join(app, 'public/lang/EXPRESSIONS.md'));

// ── how a placeholder is filled ─────────────────────────────────────────────

const KIND_ACTOR = {
  'fhir-validator': 'FHIRValidator', 'terminology-server': 'TxServer',
  'hcert-decoder': 'HCertDecoder', 'smart-helper': 'SmartHelper',
  'tng-validator': 'TNGValidator', 'archimate-repository': 'ModelRepo',
  'eira-validator': 'EIRA',
};
const ACTORS = ['Client', 'Server', 'Peer'];
const REFS = ['$bundle', '$outcome', '$other'];
const VARS = ['$result', '$docId', '$other'];

// Decided by the words immediately before the placeholder; first match wins.
// '...' matches any one word. `only` restricts the rule to one placeholder kind.
const CONTEXT = [
  [['with', 'id'], null, '"pat-1"'],
  [['as', 'defined', 'by'], null, '"http://hl7.org/fhir/uv/ips/ImplementationGuide/hl7.fhir.uv.ips"'],
  [['available', 'as'], null, '"Document Registry"'],
  [['data', 'pool'], null, '"patients"'],
  [['scriptlet'], null, '"check-bundle"'],
  [['set', 'header'], null, '"Accept"'],
  [['Accept', 'to'], null, '"application/fhir+json"'],
  [['with', 'format'], null, '"yyyy-MM-dd"'],
  [['with', 'status'], null, '201'],
  [['within'], null, '30'],
  [['wait'], null, '5'],
  [['errors', 'matching'], null, '"Slicing cannot be evaluated"'],
  [['evidence', 'of'], null, '"the allergy list on screen"'],
  [['informed'], 'string', '"Open the patient summary"'],
  [['asked', 'for'], 'var', '$token'],
  [['$token', 'with'], null, '"Paste the access token"'],
  [['displayed', 'for'], null, '"each allergy"'],
  [['for'], 'string', '"Paste the access token"'],
  [['uploads', 'a', 'file', 'as'], 'var', '$screenshot'],
  [['file', 'as', '$screenshot', 'with'], null, '"a screenshot of the summary"'],
  [['these', 'is'], 'word', 'displayed'],
  [['log'], null, '$response.status'],
  [['at'], 'url', '"http://server.example.org/fhir"'],
  [['at'], 'string', '"/Patient"'],
  [['material', 'from'], null, '"https://raw.githubusercontent.com/HL7/fhir-tx-ecosystem-ig/main/tests/"'],
  [['from'], 'string', '"/Patient/pat-1"'],
  [['gets'], 'string', '"http://server.example.org/fhir/Patient/pat-1"'],
  [['to'], 'url', '"http://server.example.org/fhir"'],
  [['set'], 'var', '$expected'],
  [['$expected', 'to'], null, '"final"'],
  [['as'], 'var', '$result'],
  [['package'], null, '"hl7.fhir.uv.ips#2.0.0"'],
  [['IG'], null, '"hl7.fhir.uv.ips#2.0.0"'],
  [['targeting'], 'string', '"4.0.1"'],
  [['evaluates'], null, '"Bundle.entry.resource.ofType(Composition).status"'],
  [['satisfy'], null, '"Bundle.entry.count() > 1"'],
  [['request', 'in'], null, '"expand/simple-req.json"'],
  [['parameters', 'in'], null, '"parameters-default.json"'],
  [['pattern', 'in'], null, '"expand/simple-resp.json"'],
  [['loads', 'model'], null, '"eira-core"'],
  [['extension'], null, '"2.5.29.15"'],
  [['keyUsage'], null, '"digitalSignature"'],
  [['include'], null, '"1.3.6.1.5.5.7.3.1"'],
  [['groups'], null, '"DSC, UPLOAD"'],
  [['inspects', 'group'], null, '"DSC"'],
  [['file'], null, '"1A2B3C.pem"'],
  [['with', 'pin'], null, '"1234"'],
  [['expecting', 'status'], null, '401'],
  [['valid'], 'word', 'Patient'],
  [['CA', 'should', 'be'], 'value', 'true'],
  [['pathLen', 'should', 'be'], null, '2'],
  [['algorithm', 'should', 'be', 'one'], 'string', '"EC, RSA"'],
  [['with'], 'value', '$bundle'],
  // assertion values, chosen by the comparator
  [['$response.status', 'should', 'be'], 'value', '200'],
  [['should', 'not', 'be'], 'value', '"draft"'],
  [['should', 'be'], 'value', '"document"'],
  [['should', 'not', 'contain'], 'value', '"error"'],
  [['should', 'contain'], 'value', '"Patient"'],
  [['should', 'match'], 'string', '"^Bundle/[A-Za-z0-9-]+$"'],
  [['one', 'of'], 'string', '"final, amended"'],
  [['at', 'least'], 'value', '1'],
  [['at', 'most'], 'value', '10'],
  [['greater', 'than'], 'value', '0'],
  [['less', 'than'], 'value', '100'],
  [['should', 'equal'], 'value', '$total'],
  [['minus'], 'value', '1'],
];
// Decided by what follows the placeholder.
const AFTER = [[' times', 'value', '3']];

const DEFAULT = {
  string: '"text"', value: '"200"', path: '"Bundle.type"',
  url: '"http://example.org"', int: '30', word: 'displayed',
  kind: 'fhir-validator', type: 'FHIR resource',
  canonical: '"http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips"',
};

// Example cell value for a named table column.
const COLUMN_VALUE = {
  ignore: 'slicing', item: 'The allergy list is on screen', parameter: 'gdhcn_env',
  value: 'test', algorithm: 'EC', minBits: '256', bestPractice: 'ignore',
  resourceId: 'pat-1', pattern: 'expand/alt-resp.json', group: 'DSC',
  name: 'status', view: 'Business Layer', resource: 'codesystems/simple.json',
  path: 'Patient.birthDate', expression: "'1990-01-01'", part: 'value',
  op: 'delete', maxYears: '3',
};

const article = (w) => ('aeioux'.includes((w[0] || '').toLowerCase()) ? 'an' : 'a');

function pick(before, after, name, seen) {
  for (const [suffix, only, val] of AFTER) {
    if (only === name && after.startsWith(suffix)) return val;
  }
  for (const [words, only, val] of CONTEXT) {
    if (only && only !== name) continue;
    if (before.length < words.length) continue;
    const seg = before.slice(before.length - words.length);
    if (words.every((w, i) => w === '...' || w === seg[i])) return val;
  }
  if (name === 'var') return VARS[Math.min(seen.var || 0, VARS.length - 1)];
  if (name === 'ref') return REFS[Math.min(seen.ref || 0, REFS.length - 1)];
  return DEFAULT[name] ?? '...';
}

function render(text) {
  // A colon ends the sentence: whatever optional part trails it is dropped so
  // the line reads as the table or doc-string step it is.
  let out = text.replace(/:\s*\([^()]*\)\?/g, ':');
  out = out.replace(/\((.*?)\)\?/g, '$1');            // keep the optional parts
  out = out.replace(/(?<![{\w])([a-z]+)\/([a-z]+)(?![\w}])/g, '$1'); // first alternative

  const seen = {};
  let result = '';
  let pos = 0;
  for (const m of out.matchAll(/\{(\w+)(?::([\w-]+))?\}/g)) {
    const [, name, kind] = m;
    result += out.slice(pos, m.index);
    pos = m.index + m[0].length;
    let val;
    if (name === 'actor') {
      val = kind ? (KIND_ACTOR[kind] || 'Helper')
                 : ACTORS[Math.min(seen.actor || 0, ACTORS.length - 1)];
    } else {
      const before = (result.match(/[A-Za-z$.0-9_-]+/g) || []).slice(-4);
      val = pick(before, out.slice(pos), name, seen);
    }
    seen[name] = (seen[name] || 0) + 1;
    result += val;
  }
  return result + out.slice(pos);
}

// ── reading a language or dialect file ──────────────────────────────────────

function read(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const data = yaml.load(raw);
  const lines = raw.split('\n');
  const linenos = lines.reduce((acc, ln, i) => (/^ {2}- text:/.test(ln) ? [...acc, i + 1] : acc), []);
  const steps = data.verbs || data.steps || [];
  let k = 0;
  const out = [];
  for (const s of steps) {
    if (!s || typeof s !== 'object' || !s.text) continue;
    const line = linenos[k++] ?? 0;
    const blob = JSON.stringify(s);
    let cols = (s.table && typeof s.table === 'object' && s.table.required) || null;
    const uniq = (re) => [...new Set([...blob.matchAll(re)].map((m) => m[1]))].sort();
    if (!cols || !cols.length) cols = uniq(/\$row\.([\w-]+)/g);
    // $opt.<name> reads a two-column | option | value | lookup, so the names
    // are rows rather than headers.
    let opts = [];
    if (!cols.length) opts = uniq(/\$opt\.([\w-]+)/g);
    out.push({
      text: s.text,
      line,
      // A step that reads $docString takes a doc string, not a table.
      cols: blob.includes('$docString') ? [] : cols,
      opts: blob.includes('$docString') ? [] : opts,
      table: render(s.text).trimEnd().endsWith(':'),
    });
  }
  return { steps: out, lines, data };
}

const SECTION = /^ {2}# (\d[a-z]?)\. /;

const TITLES = {
  1: ['Who is taking part',
      'A scenario starts by naming the systems. Declaring a kind tells the compiler which dialect ' +
      'owns that actor, so its verbs and its validator are in scope for the rest of the file.'],
  '1b': ['Dropping to raw ITB',
      'When no sentence fits, call a hand-written scriptlet.'],
  2: ['Sending a request',
      'These carry the exchange and nothing more. They deliberately do not assert the status, ' +
      'because for a raw exchange the status is part of what the test is checking. The response ' +
      'is then readable as $response.status and $response.body.'],
  3: ['Making and reading values',
      'A variable is written $name and read the same way. A path starting with a slash is a JSON ' +
      'pointer whatever the value is; any other path goes to the evaluator for that value type.'],
  4: ['Being called back',
      'The test bed can stand in for a peer and wait to be contacted. What arrived is readable as ' +
      '$received.method, $received.path and $received.body.'],
  5: ['Checking a value',
      'Every comparator has two forms: on a value, and on a path inside a value. Both are listed.'],
  6: ['Conformance',
      'Dispatched to whichever dialect owns the validator, either the actor named on the line or ' +
      'the one that owns the value type.'],
  7: ['Asking a person',
      'For requirements about what a system shows or does, which no request can settle. Each of ' +
      'these becomes a dialog in the test bed.'],
  8: ['Logging', ''],
};

const SAMPLE = `@lang:itb-core-en@^2 @dialect:fhir-validator@^2
Feature: IHE MHD Document Responder, nominal update

  Background:
    Given DocumentResponder is the system under test at "https://example.org/fhir" as defined by "https://profiles.ihe.net/ITI/MHD/StructureDefinition/IHE.MHD.DocumentResponder"
    And DocumentSource is infrastructure
    And FHIRValidator is a fhir-validator at "http://fhir-validator:8081"
    And set header "Accept" to "application/fhir+json"
    When DocumentSource posts to AuthServer at "/token" with:
      """
      { "grant_type": "client_credentials", "scope": "document" }
      """
    And extract "/access_token" as $iuaToken
    And set bearer token from $iuaToken

  Scenario: the description is updated, and the update is idempotent
    When DocumentSource gets "https://example.org/files/DocumentReference.json" as $originalDoc
    Then $originalDoc should not be empty
    When DocumentSource posts to DocumentResponder at "/DocumentReference" with body $originalDoc
    Then $response.status should be 201
    And extract "/id" as $docId
    When DocumentSource puts to DocumentResponder at "/DocumentReference/" with id $docId with body $updatePayload
    Then $response.status should be 200
    When DocumentSource gets from DocumentResponder at "/DocumentReference/" with id $docId as $updated
    And $updated at "DocumentReference.status" should be "current"
    And $updated should conform to "http://fhir.ch/ig/ch-epr-fhir/StructureDefinition/ch-mhd-documentreference-comprehensive"`;

// ── write it out ────────────────────────────────────────────────────────────

const doc = [];
const w = (s = '') => doc.push(s);

function block(items) {
  w('```gherkin');
  for (const s of items) {
    w(render(s.text));
    if (s.table && s.cols.length) {
      w('  | ' + s.cols.join(' | ') + ' |');
      w('  | ' + s.cols.map((c) => COLUMN_VALUE[c] ?? '...').join(' | ') + ' |');
    } else if (s.table && s.opts.length) {
      w('  | option | value |');
      for (const o of s.opts) w(`  | ${o} | ${COLUMN_VALUE[o] ?? '...'} |`);
    } else if (s.table) {
      w('  """');
      w('  ...');
      w('  """');
    }
  }
  w('```');
  w();
}

const core = read(CORE);
const secs = core.lines
  .map((ln, i) => (SECTION.test(ln) ? [i + 1, ln.match(SECTION)[1]] : null))
  .filter(Boolean);
const sectionOf = (lineno) => {
  let name = '8';
  for (const [ln, id] of secs) { if (ln < lineno) name = id; else break; }
  return name;
};

w('# Every expression in the language');
w();
w('Generated by `scripts/gen-language-docs.mjs` from `lang/en.yml` and the dialects under');
w('`public/components/`. Regenerate it rather than editing it by hand.');
w();
w('Each line below is one sentence the language accepts, filled in so it reads the way a feature');
w('file reads. Where a sentence has an optional part the example shows it included. Where it offers');
w('a choice of words, such as `to/on` or `a/an`, the example shows the first.');
w();
w(`The core has **${core.steps.length}** sentences. A dialect adds verbs to these; it never adds a sentence shape.`);
w();
w('## What a whole scenario looks like');
w();
w('Everything after this section is a list of single lines. This is what they look like together in');
w('a real file. The first line loads the language and one dialect, the background names the systems');
w('and fetches a token, and each scenario is a sequence of requests and checks.');
w();
w('```gherkin');
w(SAMPLE);
w('```');
w();
w('## The core');
w();

const groups = new Map();
for (const s of core.steps) {
  const key = sectionOf(s.line);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(s);
}
for (const [key, items] of groups) {
  const [title, blurb] = TITLES[key] || [key, ''];
  w('### ' + title);
  w();
  if (blurb) { w(blurb); w(); }
  block(items);
}

w('## The dialects');
w();
w('A dialect is a plugin: verbs for one domain, plus the actor kinds and value types those verbs');
w('act on. A feature file loads one with a `@dialect:` tag, and every core sentence above keeps');
w('working unchanged alongside it.');
w();

for (const comp of fs.readdirSync(COMPONENTS).sort()) {
  const p = path.join(COMPONENTS, comp, 'steps.yml');
  if (!fs.existsSync(p)) continue;
  const { steps, data } = read(p);
  w('### ' + comp);
  w();
  if (data.description) { w(String(data.description).trim()); w(); }
  const kinds = data.kinds || [];
  const types = data.types || {};
  if (kinds.length || Object.keys(types).length) {
    w('What it registers:');
    w();
    w('```gherkin');
    for (const k of kinds) {
      w(`${KIND_ACTOR[k] || 'Helper'} is ${article(k)} ${k} at "http://example.org/${k}"`);
    }
    for (const t of Object.values(types)) {
      const nm = typeof t === 'object' && t.name ? t.name : String(t);
      w(`$value is ${article(nm)} ${nm}`);
    }
    if (data.conforms) w('$value should conform to "http://example.org/StructureDefinition/Thing"');
    w('```');
    w();
  }
  w(`Its ${steps.length} verbs:`);
  w();
  block(steps);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, doc.join('\n').replace(/\s+$/, '') + '\n', 'utf8');
console.log(`wrote ${OUT}  (${core.steps.length} core sentences)`);
