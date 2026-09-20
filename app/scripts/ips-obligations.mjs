#!/usr/bin/env node
// From the published IPS implementation guide to executable test cases —
// and back, to prove nothing was missed.
//
//   node scripts/ips-obligations.mjs extract    read hl7.fhir.uv.ips, write public/data/ips-obligations.json
//   node scripts/ips-obligations.mjs generate   write public/features/ips-creator.feature and ips-consumer.feature
//   node scripts/ips-obligations.mjs selftest   evaluate every generated assertion against the IG's own examples
//   node scripts/ips-obligations.mjs check      every obligation is covered by a scenario that names its element
//   node scripts/ips-obligations.mjs all        the four in order (default)
//
// Options: --package <dir|tgz>   the IPS package (default: download hl7.fhir.uv.ips#2.0.1 into a cache)
//          --features <dir>      where the features live (default: public/features)
//          --spec <id>#<version> --url <site>   another IG that uses obligation extensions
//          --reference <bundleId> --no-info <bundleId> --minimal <bundleId>   its example documents
//          --validator <url>     the FHIR validator the features declare
// The extractor, the assertion builder, the self-test and the coverage check
// are generic for any IG that states obligations on its profiles. What is
// IPS-specific is small and marked SPEC-SPECIFIC below: which sections are
// required, and the value-set discriminators of the Observation profiles.
//
// THE METHOD, so it can be repeated for another specification:
//   1. The actors are the ActorDefinition resources in the package.
//   2. The obligations are the `obligation` extensions on the profiles'
//      snapshot elements: (profile, element, code, actor).
//   3. Each obligation code maps to a test pattern (OBLIGATION_PATTERNS below):
//        SHALL:populate            the element is present in every produced instance
//        SHALL:populate-if-known   present wherever the reference dataset has it
//        SHALL/SHOULD:able-to-populate  present in the produced document, or attested
//        MAY:able-to-populate      recorded, not asserted
//        SHALL:handle              the Consumer accepts a document carrying it without error
//        SHOULD:display            the Consumer shows it to a human (tester-confirmed)
//   4. The reference dataset is the IG's own all-sections example: what the
//      Creator's system is loaded with, and what the Consumer is handed. Which
//      elements it actually carries decides whether an assertion can be
//      `all(...)`, `exists()`, or only an attestation.
//   5. Every scenario declares what it covers (@profile:, @covers: tags) and
//      must MENTION each covered element in a step. `check` enforces both.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, '..');
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const cmd = args.find(a => ['extract', 'generate', 'selftest', 'check', 'all'].includes(a)) ?? 'all';
const FEATURES = path.resolve(opt('--features', path.join(APP, 'public', 'features')));
const DATA = path.join(APP, 'public', 'data', 'ips-obligations.json');
const COVERAGE = path.join(APP, 'public', 'data', 'ips-obligation-coverage.json');
const [IPS_ID, IPS_VERSION] = opt('--spec', 'hl7.fhir.uv.ips#2.0.1').split('#');
const IPS_URL = opt('--url', 'https://hl7.org/fhir/uv/ips');
const VALIDATOR = opt('--validator', 'http://fhir-validator:8080');

// ─────────────────────────────────────────────────────────────────────
// 1. The package
// ─────────────────────────────────────────────────────────────────────

function packageDir() {
  const given = opt('--package');
  if (given) {
    const p = path.resolve(given);
    if (p.endsWith('.tgz')) return extractTgz(p);
    return fs.existsSync(path.join(p, 'package.json')) ? p : path.join(p, 'package');
  }
  const cache = path.join(os.tmpdir(), `otb-${IPS_ID}-${IPS_VERSION}`);
  if (fs.existsSync(path.join(cache, 'package', 'package.json'))) return path.join(cache, 'package');
  fs.mkdirSync(cache, { recursive: true });
  const tgz = path.join(cache, 'package.tgz');
  console.error(`downloading ${IPS_URL}/package.tgz`);
  execSync(`curl -sL -o "${tgz}" ${IPS_URL}/package.tgz`);
  execSync(`tar -xzf "${tgz}" -C "${cache}"`);
  return path.join(cache, 'package');
}
function extractTgz(tgz) {
  const dir = path.join(os.tmpdir(), 'otb-ips-' + path.basename(tgz, '.tgz'));
  fs.mkdirSync(dir, { recursive: true });
  execSync(`tar -xzf "${tgz}" -C "${dir}"`);
  return path.join(dir, 'package');
}
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));

// ─────────────────────────────────────────────────────────────────────
// 2. Actors and obligations
// ─────────────────────────────────────────────────────────────────────

const OBLIGATION_EXT = 'http://hl7.org/fhir/StructureDefinition/obligation';

function extract(pkg) {
  const files = fs.readdirSync(pkg);
  const actors = {};
  for (const f of files.filter(f => /^Basic-.*\.json$/.test(f))) {
    const d = readJson(path.join(pkg, f));
    const ext = Object.fromEntries((d.extension ?? []).map(e => [e.url.split('.').pop(), e.valueString ?? e.valueCode ?? e.valueUri ?? e.valueMarkdown ?? e.valueCanonical]));
    if (!ext.url) continue;
    actors[d.id] = { id: d.id, url: ext.url, title: ext.title, description: ext.description, documentation: ext.documentation, derivedFrom: ext.derivedFrom, capabilities: ext.capabilities };
  }

  const profiles = {};
  const obligations = [];
  for (const f of files.filter(f => /^StructureDefinition-.*\.json$/.test(f))) {
    const sd = readJson(path.join(pkg, f));
    const elements = sd.snapshot?.element ?? [];
    let any = false;
    for (const el of elements) {
      for (const e of el.extension ?? []) {
        if (e.url !== OBLIGATION_EXT) continue;
        const code = e.extension.find(x => x.url === 'code')?.valueCode;
        for (const a of e.extension.filter(x => x.url === 'actor')) {
          obligations.push({ profile: sd.id, element: el.id, code, actor: a.valueCanonical.split('/').pop().split('|')[0] });
          any = true;
        }
      }
    }
    if (any) profiles[sd.id] = { id: sd.id, url: sd.url, type: sd.type, title: sd.title, elements: Object.fromEntries(elements.map(el => [el.id, slim(el)])) };
  }
  return { spec: { id: IPS_ID, version: IPS_VERSION, url: IPS_URL }, actors, profiles, obligations };
}

/** Only what path building needs from an ElementDefinition. */
function slim(el) {
  const out = { path: el.path, min: el.min, max: el.max };
  const pat = el.patternCodeableConcept ?? el.fixedCodeableConcept;
  if (pat?.coding?.[0]) out.code = { system: pat.coding[0].system, code: pat.coding[0].code };
  if (el.type?.[0]?.profile?.[0]) out.extUrl = el.type[0].profile[0].split('|')[0];
  const targets = (el.type ?? []).flatMap(t => t.targetProfile ?? []).map(t => t.split('|')[0].split('/').pop());
  if (targets.length) out.targets = targets;
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// 3. From an element id to a FHIRPath, and to what to look for in the example
// ─────────────────────────────────────────────────────────────────────

const PRIMITIVES = new Set(['dateTime', 'date', 'time', 'instant', 'string', 'boolean', 'integer', 'decimal', 'code', 'uri', 'url', 'canonical', 'id', 'oid', 'markdown', 'base64Binary', 'positiveInt', 'unsignedInt']);
const fhirType = name => { const t = name[0].toLowerCase() + name.slice(1); return PRIMITIVES.has(t) ? t : name; };

/** "Condition-uv-ips" → "Condition"; "Consent" → "Consent". */
const resourceTypeOf = id => id ? /^([A-Z][A-Za-z]+)/.exec(id)?.[1] : undefined;

/** Section / category / etc. discriminators come from the profile's own patterns. */
const SLICE_TARGET_TYPE = {
  'results-observation-laboratory-pathology': 'Observation', 'results-observation-radiology': 'Observation', 'results-diagnosticReport': 'DiagnosticReport',
  problem: 'Condition', allergyOrIntolerance: 'AllergyIntolerance', medicationStatementOrRequest: 'MedicationStatement', immunization: 'Immunization',
  procedure: 'Procedure', deviceStatement: 'DeviceUseStatement',
};

/**
 * Parse "Composition.section:sectionAllergies.entry:allergyOrIntolerance" into
 * segments with what each one selects, using the profile's element metadata.
 */
function parseSegments(profile, elementId) {
  const parts = elementId.split('.');
  const segs = [];
  let idSoFar = parts[0];
  for (const raw of parts.slice(1)) {
    idSoFar += '.' + raw;
    const [name0, slice] = raw.split(':');
    const meta = profile.elements[idSoFar] ?? {};
    const seg = { raw, name: name0.replace(/\[x\]$/, ''), choice: name0.endsWith('[x]'), slice, meta };
    if (seg.choice && slice) seg.type = fhirType(slice.slice(seg.name.length));
    else if (slice) {
      const child = profile.elements[idSoFar + '.code'];
      if (name0 === 'section' && child?.code) seg.codeOn = { field: 'code', ...child.code };
      else if (name0 === 'event' && child?.code) seg.codeOn = { field: 'code', ...child.code };
      else if (name0 === 'category' && meta.code) seg.codeOn = { field: '', ...meta.code };
      else if (name0 === 'extension' && meta.extUrl) seg.extUrl = meta.extUrl;
      else if (name0 === 'entry' && slice === 'composition') seg.entryType = 'Composition';
      else if (name0 === 'entry') seg.entryType = SLICE_TARGET_TYPE[slice] ?? resourceTypeOf(meta.targets?.[0]);
      // other slices (result:observation-results, category with no pattern): plain name
    }
    segs.push(seg);
  }
  return segs;
}

function segToPath(seg) {
  if (seg.type) return `${seg.name}.ofType(${seg.type})`;
  if (seg.codeOn) {
    const f = seg.codeOn.field ? `${seg.codeOn.field}.` : '';
    return `${seg.name}.where(${f}coding.where(system='${seg.codeOn.system}' and code='${seg.codeOn.code}').exists())`;
  }
  if (seg.extUrl) return `extension('${seg.extUrl}')`;
  if (seg.entryType && seg.name === 'entry' && seg.raw.startsWith('entry:composition')) return `entry.where(resource.ofType(Composition).exists())`;
  if (seg.entryType) return `entry.where(reference.contains('${seg.entryType}') or reference.exists())`;
  return seg.name;
}

/** How to select the profile's instances inside the document. */
function selector(profile) {
  const t = profile.type;
  if (t === 'Bundle') return { expr: 'Bundle', kind: 'bundle' };
  if (t === 'CodeableConcept' || t === 'Coding') return { expr: `Bundle.entry.resource.descendants().ofType(${t})`, kind: 'datatype', type: t };
  const code = profile.elements[`${t}.code`]?.code;
  const cat = Object.entries(profile.elements).find(([k, v]) => k.startsWith(`${t}.category:`) && v.code)?.[1].code;
  const byVs = OBS_CODES[profile.id];
  let where = '';
  if (cat) where = `.where(category.coding.where(code='${cat.code}').exists())`;
  else if (code) where = `.where(code.coding.where(code='${code.code}').exists())`;
  else if (byVs) where = `.where(code.coding.where(${byVs.map(c => `code='${c}'`).join(' or ')}).exists())`;
  return { expr: `Bundle.entry.resource.ofType(${t})${where}`, kind: 'resource', type: t, cat: cat?.code, code: code?.code, codes: byVs };
}
/** SPEC-SPECIFIC: profiles whose discriminator is a value-set binding on Observation.code. */
const OBS_CODES = {
  'Observation-pregnancy-edd-uv-ips': ['11778-8', '11779-6', '11780-4'],
  'Observation-pregnancy-outcome-uv-ips': ['11636-8', '11637-6', '11638-4', '11639-2', '11640-0', '11612-9', '11613-7', '11614-5', '33065-4'],
};

/** Human aliases a scenario may use to mention the element. */
function aliases(profile, elementId, segs) {
  const last = segs[segs.length - 1];
  const out = new Set([elementId, elementId.split('.').slice(1).join('.')]);
  if (last) {
    out.add(last.name);
    if (last.slice) out.add(last.slice);
    if (last.codeOn) out.add(last.codeOn.code);
    if (last.entryType) out.add(last.entryType);
    if (last.extUrl) out.add(last.extUrl.split('/').pop());
  }
  if (!segs.length) out.add(profile.type);
  return [...out].filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────
// 4. Presence in the reference example — a small walker over the JSON
// ─────────────────────────────────────────────────────────────────────

function loadExample(pkg, id) {
  return readJson(path.join(pkg, 'example', `Bundle-${id}.json`));
}
const arr = v => v === undefined ? [] : Array.isArray(v) ? v : [v];

function selectInstances(bundle, sel) {
  const resources = bundle.entry.map(e => e.resource);
  if (sel.kind === 'bundle') return [bundle];
  if (sel.kind === 'datatype') return collectDatatype(resources, sel.type);
  let list = resources.filter(r => r.resourceType === sel.type);
  const hasCode = (cc, code) => arr(cc).some(c => arr(c?.coding).some(x => x.code === code));
  if (sel.cat) list = list.filter(r => hasCode(r.category, sel.cat));
  else if (sel.code) list = list.filter(r => hasCode(r.code, sel.code));
  else if (sel.codes) list = list.filter(r => sel.codes.some(c => hasCode(r.code, c)));
  return list;
}
function collectDatatype(resources, type) {
  const out = [];
  const walk = v => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    if (type === 'CodeableConcept' && Array.isArray(v.coding)) out.push(v);
    if (type === 'Coding' && v.system !== undefined && v.code !== undefined && v.coding === undefined && v.value === undefined && v.resourceType === undefined) out.push(v);
    for (const k of Object.keys(v)) walk(v[k]);
  };
  walk(resources);
  return out;
}
function step(obj, seg) {
  if (!obj || typeof obj !== 'object') return [];
  if (seg.type) { const key = seg.name + seg.type[0].toUpperCase() + seg.type.slice(1); return arr(obj[key]); }
  if (seg.choice) return Object.keys(obj).filter(k => k.startsWith(seg.name) && k !== seg.name).flatMap(k => arr(obj[k]));
  if (seg.codeOn) {
    return arr(obj[seg.name]).filter(x => {
      const cc = seg.codeOn.field ? x?.[seg.codeOn.field] : x;
      return arr(cc).some(c => arr(c?.coding).some(y => y.code === seg.codeOn.code));
    });
  }
  if (seg.extUrl) return arr(obj.extension).filter(x => x.url === seg.extUrl);
  if (seg.entryType) {
    if (seg.raw.startsWith('entry:composition')) return arr(obj.entry).filter(e => e.resource?.resourceType === 'Composition');
    return arr(obj.entry); // references; the type check is on the bundle
  }
  return arr(obj[seg.name]);
}
const walk = (obj, segs) => segs.reduce((vals, seg) => vals.flatMap(v => step(v, seg)), [obj]);

/** 'all' | 'some' | 'none': do the parents in the example carry the last segment? */
function presence(bundle, sel, segs) {
  const parents = walk(null, []) && selectInstances(bundle, sel).flatMap(i => walk(i, segs.slice(0, -1)));
  if (!parents.length) return 'none';
  const has = parents.map(p => step(p, segs[segs.length - 1]).length > 0);
  if (has.every(Boolean)) return 'all';
  if (has.some(Boolean)) return 'some';
  return 'none';
}

/** A short human rendering of the example's value, for the Consumer prompts. */
function sample(bundle, sel, segs) {
  let vals = selectInstances(bundle, sel).flatMap(i => walk(i, segs));
  const last = segs[segs.length - 1];
  if (last?.entryType && last.name === 'entry') {
    const byUrl = new Map(bundle.entry.map(e => [e.fullUrl, e.resource]));
    vals = vals.filter(e => (e.reference ?? '').startsWith(last.entryType + '/') || byUrl.get(e.reference)?.resourceType === last.entryType);
  }
  const v = vals[0];
  if (v === undefined) return '';
  const s = render(v);
  return s.length > 40 ? s.slice(0, 37) + '…' : s;
}
function render(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return render(v[0]);
  if (v.title && typeof v.title === 'string') return v.title;           // a section
  if (typeof v.text === 'string') return v.text;                         // CodeableConcept.text
  if (v.text && typeof v.text === 'object') return v.text.status ? '(narrative)' : '(present)';
  if (v.coding?.[0]) return v.coding[0].display ?? v.coding[0].code ?? '';
  if (v.display) return v.display;
  if (v.code && typeof v.code === 'string') return v.code;
  if (v.value !== undefined) return `${v.value}${v.unit ? ' ' + v.unit : ''}`;
  if (v.reference) return v.reference;
  if (v.family) return [arr(v.given).join(' '), v.family].filter(Boolean).join(' ');
  if (v.name && typeof v.name === 'string') return v.name;
  if (v.start || v.end) return v.start && v.end ? `${v.start} to ${v.end}` : v.start ? `from ${v.start}` : `until ${v.end}`;
  if (v.resourceType) return v.resourceType;
  return '(present)';
}

// ─────────────────────────────────────────────────────────────────────
// 5. Test cases
// ─────────────────────────────────────────────────────────────────────

const REFERENCE = opt('--reference', 'bundle-ips-all-sections');
const NO_INFO = opt('--no-info', 'bundle-no-info-required-sections');
const MINIMAL = opt('--minimal', 'bundle-minimal');
// SPEC-SPECIFIC: the sections a document must always carry (slice name → LOINC).
const REQUIRED_SECTIONS = { sectionProblems: '11450-4', sectionAllergies: '48765-2', sectionMedications: '10160-0' };

const short = id => id.replace(/-uv-ips$/, '');
let _fp;
function holds(bundle, expr) {
  _fp ??= { fhirpath: require('fhirpath'), model: require('fhirpath/fhir-context/r4') };
  try { const r = _fp.fhirpath.evaluate(bundle, expr, null, _fp.model); return r.length === 1 && r[0] === true; }
  catch { return false; }
}
const strength = code => code.split(':')[0];
const kind = code => code.split(':')[1];

/** One scenario per profile, plus the document-level and the no-information cases. */
function planCreator(model, pkg) {
  const ref = loadExample(pkg, REFERENCE);
  const refPatient = ref.entry.map(e => e.resource).find(r => r.resourceType === 'Patient');
  const scenarios = [];
  let n = 0;
  const byProfile = groupBy(model.obligations.filter(o => o.actor === 'Creator'), o => o.profile);
  const order = Object.keys(model.profiles).sort((a, b) => rank(a) - rank(b));
  for (const pid of order) {
    const obls = byProfile[pid];
    if (!obls) continue;
    const profile = model.profiles[pid];
    const sel = selector(profile);
    const covers = [];
    const lines = [];
    const attest = [];
    const mays = [];
    const byElement = groupBy(obls, o => o.element);
    for (const [element, list] of Object.entries(byElement)) {
      const segs = parseSegments(profile, element);
      const codes = list.map(o => o.code);
      covers.push(element);
      const p = presence(ref, sel, segs);
      const last = segs[segs.length - 1];
      const parentPath = segs.slice(0, -1).map(segToPath).join('.');
      const lastPath = segToPath(last);
      const parents = parentPath ? `${sel.expr}.${parentPath}` : sel.expr;
      const strongest = codes.find(c => c.startsWith('SHALL:populate') && !c.includes('able')) ?? codes.find(c => c.startsWith('SHALL')) ?? codes[0];
      const label = `${element} (${codes.join(', ')})`;
      if (codes.every(c => c.startsWith('MAY'))) { mays.push(element); continue; }
      const tail = last.entryType && !last.raw.startsWith('entry:composition') ? ` and Bundle.entry.resource.ofType(${last.entryType}).exists()` : '';
      const allForm = (sel.kind === 'bundle' && !parentPath ? `Bundle.${lastPath}.exists()` : `${parents}.all(${lastPath}.exists())`) + tail;
      const someForm = `${parents}.where(${lastPath}.exists()).exists()` + tail;
      // The walker's guess, then the FHIRPath engine's verdict on the reference
      // document — the same engine that will judge a real one.
      let form = kind(strongest) === 'populate' || p === 'all' ? 'all' : p === 'some' ? 'some' : 'none';
      if (form === 'all' && !holds(ref, allForm)) form = holds(ref, someForm) ? 'some' : 'none';
      if (form === 'some' && !holds(ref, someForm)) form = 'none';
      if (form === 'none' && kind(strongest) === 'populate') form = 'all'; // a SHALL:populate is asserted even if the example lacks it
      if (form === 'none') { attest.push(element); continue; }
      lines.push({ kind: 'assert', element, codes, expr: form === 'all' ? allForm : someForm, presence: form, label });
    }
    n++;
    scenarios.push({
      id: `ips-creator-${String(n).padStart(3, '0')}`,
      profile: pid,
      title: `${profile.title ?? pid} — the Creator populates ${creatorSummary(obls)}`,
      covers, lines, attest, mays, sel,
    });
  }
  return { scenarios, refPatient, refBundleId: REFERENCE };
}
function creatorSummary(obls) {
  const must = new Set(obls.filter(o => o.code === 'SHALL:populate').map(o => o.element.split('.').slice(1).join('.')));
  const ifKnown = obls.filter(o => o.code.endsWith('populate-if-known')).length;
  const parts = [];
  if (must.size) parts.push(`${[...must].slice(0, 4).join(', ')}${must.size > 4 ? ' and more' : ''}`);
  if (ifKnown) parts.push(`${ifKnown} element${ifKnown === 1 ? '' : 's'} when known`);
  return parts.join('; ') || 'its elements';
}
function rank(pid) {
  const order = ['Bundle', 'Composition', 'Patient', 'Practitioner', 'PractitionerRole', 'Organization', 'AllergyIntolerance', 'Condition', 'Medication', 'MedicationStatement', 'MedicationRequest', 'Immunization', 'Observation-results', 'DiagnosticReport', 'Specimen', 'ImagingStudy', 'Procedure', 'Device', 'DeviceUseStatement', 'Flag', 'Observation-pregnancy', 'Observation-tobacco', 'Observation-alcohol', 'CodeableConcept', 'Coding'];
  const i = order.findIndex(o => pid.startsWith(o));
  return i < 0 ? 99 : i;
}
const groupBy = (xs, f) => xs.reduce((m, x) => ((m[f(x)] ??= []).push(x), m), {});

function writeCreator(model, pkg) {
  const { scenarios, refPatient, refBundleId } = planCreator(model, pkg);
  const refName = `${arr(refPatient.name)[0]?.given?.join(' ')} ${arr(refPatient.name)[0]?.family}`;
  const refIdentifier = arr(refPatient.identifier)[0]?.value;
  const out = [];
  out.push(`# GENERATED by app/scripts/ips-obligations.mjs from ${IPS_ID} ${IPS_VERSION}. Edit the generator, not this file.`);
  out.push(`#`);
  out.push(`# One scenario per profile that carries Creator obligations. Each scenario`);
  out.push(`# declares the elements it covers (@covers:) and asserts every one of them on`);
  out.push(`# the document the Creator produced for the reference patient. Which form the`);
  out.push(`# assertion takes follows the obligation and the reference data:`);
  out.push(`#   SHALL:populate                     present in every instance`);
  out.push(`#   SHALL:populate-if-known            present wherever the reference data has it`);
  out.push(`#   SHALL/SHOULD:able-to-populate      present, or attested by the tester when the`);
  out.push(`#                                      reference data cannot exercise it`);
  out.push(`#   MAY:able-to-populate               logged, not asserted`);
  out.push(`# Every test case asks for the document once — ITB runs each scenario as its own`);
  out.push(`# test case. An IPS Server is tested without the paste by ips-server.feature.`);
  out.push(`@lang:itb-core-en@^2 @dialect:fhir-validator@^2 @actor:Creator @spec:${IPS_ID}@${IPS_VERSION}`);
  out.push(`Feature: IPS Creator — obligations of ${IPS_ID} ${IPS_VERSION}`);
  out.push(`  ${model.actors.Creator.description}`);
  out.push(`  The reference patient is the IG's own all-sections example, ${refName}`);
  out.push(`  (identifier ${refIdentifier}): every element with a Creator obligation that the`);
  out.push(`  example carries must appear in the document the system produces for her.`);
  out.push('');
  out.push(`  Background:`);
  out.push(`    Given Creator is the system under test`);
  out.push(`    And FHIRValidator is a fhir-validator at "${VALIDATOR}"`);
  out.push(`    And FHIRValidator is loaded with package "${IPS_ID}#${IPS_VERSION}"`);
  out.push(`    And Creator is informed "Load the reference patient ${refName} (identifier ${refIdentifier}) into your system from ${IPS_URL}/Bundle-${refBundleId}.json, then export her International Patient Summary as a FHIR document Bundle."`);
  out.push(`    And Creator is asked for $ips with "Paste the exported IPS Bundle (JSON)"`);
  out.push(`    And $ips is a FHIR resource`);
  out.push('');
  out.push(`  Rule: The document as a whole conforms`);
  out.push('');
  out.push(`    @profile:Bundle-uv-ips`);
  out.push(`    Scenario: ips-creator-000 The exported document is a valid IPS Bundle`);
  out.push(`      Then $ips should conform to "${model.profiles['Bundle-uv-ips'].url}" ignoring slicing errors`);
  out.push(`      And $ips at "Bundle.type" should be "document"`);
  out.push('');
  let lastRule = '';
  for (const sc of scenarios) {
    const rule = ruleFor(sc.profile);
    if (rule !== lastRule) { out.push(`  Rule: ${rule}`); out.push(''); lastRule = rule; }
    out.push(`    @profile:${sc.profile}`);
    for (const chunk of chunks(sc.covers, 4)) out.push(`    ${chunk.map(c => `@covers:${c}`).join(' ')}`);
    out.push(`    Scenario: ${sc.id} ${sc.title}`);
    if (sc.sel.kind === 'resource') {
      out.push(`      # Instances: ${sc.sel.expr}`);
    }
    for (const l of sc.lines) {
      out.push(`      # ${l.label}${l.presence === 'some' ? ' — the reference data carries it on some instances' : ''}`);
      out.push(`      Then $ips at "${l.expr}" should be true`);
    }
    if (sc.attest.length) {
      out.push(`      # The reference data does not exercise these; the Creator attests the capability.`);
      const t = model.profiles[sc.profile].type;
      const names = sc.attest.map(e => e.split('.').slice(1).join('.'));
      out.push(`      When Creator submits evidence of "${t} ${names.map(n => `[${n}]`).join(', ')} being entered or exported (screenshot or a document carrying them)" as $canPopulateEvidence`);
      out.push(`      Then Creator confirms each of these is supported for "${t}, when the information is known":`);
      const w = Math.max(...names.map(n => n.length), 4);
      out.push(`        | ${'item'.padEnd(w)} | detail           |`);
      for (const n of names) out.push(`        | ${n.padEnd(w)} | can be populated |`);
    }
    for (const m of sc.mays) {
      out.push(`      And log "${m} MAY be populated — recorded, not asserted"`);
    }
    out.push('');
  }
  // The no-information case for the required sections.
  const req = Object.entries(REQUIRED_SECTIONS);
  out.push(`  Rule: A patient with no known problems, allergies or medications still gets the required sections`);
  out.push('');
  out.push(`    @profile:Composition-uv-ips`);
  out.push(`    ${req.map(([s]) => `@covers:Composition.section:${s}.emptyReason`).join(' ')}`);
  out.push(`    Scenario: ips-creator-900 Required sections carry an explicit no-information statement`);
  out.push(`      # The IG prefers a "no known …" entry over emptyReason; both are accepted here.`);
  out.push(`      Given Creator is informed "Now export the IPS of a patient for whom no problems, no allergies and no medications are known (as in ${IPS_URL}/Bundle-${NO_INFO}.json)."`);
  out.push(`      And Creator is asked for $ipsNoInfo with "Paste that IPS Bundle (JSON)"`);
  out.push(`      And $ipsNoInfo is a FHIR resource`);
  out.push(`      Then $ipsNoInfo should conform to "${model.profiles['Bundle-uv-ips'].url}" ignoring slicing errors`);
  for (const [s, code] of req) {
    out.push(`      # Composition.section:${s}.emptyReason (SHALL:populate-if-known) — or a "no known" entry`);
    out.push(`      And $ipsNoInfo at "Bundle.entry.resource.ofType(Composition).section.where(code.coding.where(code='${code}').exists()).all(emptyReason.exists() or entry.exists())" should be true`);
  }
  out.push('');
  fs.writeFileSync(path.join(FEATURES, 'ips-creator.feature'), out.join('\n'), 'utf8');
  return scenarios;
}
function ruleFor(pid) {
  if (pid.startsWith('Bundle') || pid.startsWith('Composition')) return 'The document: Bundle and Composition';
  if (/^(Patient|Practitioner|PractitionerRole|Organization)-/.test(pid)) return 'The people and organisations';
  if (/^(AllergyIntolerance|Condition|Medication|MedicationStatement|MedicationRequest)-/.test(pid)) return 'The required sections: problems, allergies, medications';
  if (/^(Immunization|Observation-results|DiagnosticReport|Specimen|ImagingStudy|Procedure|Device|DeviceUseStatement)-/.test(pid)) return 'The recommended sections: immunizations, results, procedures, devices';
  if (/^(Flag|Observation-pregnancy|Observation-tobacco|Observation-alcohol)-/.test(pid)) return 'The optional sections: alerts, pregnancy, social history';
  return 'Data types used throughout';
}
const chunks = (xs, n) => xs.length ? [xs.slice(0, n), ...chunks(xs.slice(n), n)] : [];

function writeConsumer(model, pkg) {
  const ref = loadExample(pkg, REFERENCE);
  const refPatient = ref.entry.map(e => e.resource).find(r => r.resourceType === 'Patient');
  const refName = `${arr(refPatient.name)[0]?.given?.join(' ')} ${arr(refPatient.name)[0]?.family}`;
  const byProfile = groupBy(model.obligations.filter(o => o.actor === 'Consumer'), o => o.profile);
  const order = Object.keys(model.profiles).sort((a, b) => rank(a) - rank(b));
  const out = [];
  out.push(`# GENERATED by app/scripts/ips-obligations.mjs from ${IPS_ID} ${IPS_VERSION}. Edit the generator, not this file.`);
  out.push(`#`);
  out.push(`# A Consumer's obligations are behaviours, not document content, so the test`);
  out.push(`# bed hands the Consumer the IG's own all-sections example and a tester confirms`);
  out.push(`# what the system did with it:`);
  out.push(`#   SHALL:handle     the operator attaches the import result (log or screenshot)`);
  out.push(`#                    and confirms, element by element, that it was accepted`);
  out.push(`#   SHOULD:display   the operator displays the elements, attaches a screenshot,`);
  out.push(`#                    and confirms each one from a list — one verdict per element`);
  out.push(`# Evidence files are kept by the test bed in the session report, beside the step.`);
  out.push(`# A Consumer that is a FHIR server accepting documents can be driven without a`);
  out.push(`# tester: see the last Rule.`);
  out.push(`@lang:itb-core-en@^2 @dialect:fhir-validator@^2 @actor:Consumer @spec:${IPS_ID}@${IPS_VERSION}`);
  out.push(`Feature: IPS Consumer — obligations of ${IPS_ID} ${IPS_VERSION}`);
  out.push(`  ${model.actors.Consumer.description}`);
  out.push('');
  out.push(`  Background:`);
  out.push(`    Given Consumer is the system under test`);
  out.push(`    And Tester is infrastructure`);
  out.push(`    And FHIRValidator is a fhir-validator at "${VALIDATOR}"`);
  out.push(`    And FHIRValidator is loaded with package "${IPS_ID}#${IPS_VERSION}"`);
  out.push(`    When Tester gets "${IPS_URL}/Bundle-${REFERENCE}.json" as $ips`);
  out.push(`    Then $ips should conform to "${model.profiles['Bundle-uv-ips'].url}" ignoring slicing errors`);
  out.push(`    And Consumer is informed "Import this International Patient Summary for ${refName} into the system under test, then answer the questions that follow." with $ips`);
  out.push('');
  let n = 0;
  let lastRule = '';
  for (const pid of order) {
    const obls = byProfile[pid];
    if (!obls) continue;
    const profile = model.profiles[pid];
    const sel = selector(profile);
    const byElement = groupBy(obls, o => o.element);
    const handle = [], display = [];
    for (const [element, list] of Object.entries(byElement)) {
      const segs = parseSegments(profile, element);
      const shortEl = element.split('.').slice(1).join('.');
      const value = sel.kind === 'bundle' || sel.kind === 'datatype' ? '' : sample(ref, sel, segs);
      const item = `[${shortEl}]${value ? ` = ${value}` : ''}`;
      if (list.some(o => kind(o.code) === 'handle')) handle.push({ element, shortEl, item, value });
      if (list.some(o => kind(o.code) === 'display')) display.push({ element, shortEl, item, value });
    }
    n++;
    const rule = ruleFor(pid);
    if (rule !== lastRule) { out.push(`  Rule: ${rule}`); out.push(''); lastRule = rule; }
    out.push(`    @profile:${pid}`);
    for (const chunk of chunks(Object.keys(byElement), 4)) out.push(`    ${chunk.map(c => `@covers:${c}`).join(' ')}`);
    out.push(`    Scenario: ips-consumer-${String(n).padStart(3, '0')} ${profile.title ?? pid} — the Consumer handles ${handle.length} element${handle.length === 1 ? '' : 's'}${display.length ? ` and displays ${display.length}` : ''}`);
    const what = sel.kind === 'datatype' ? `every ${profile.type} in the document` : sel.kind === 'bundle' ? 'the document' : `the ${profile.type} resource${sel.cat || sel.code || sel.codes ? 's of this kind' : 's'}`;
    const slug = short(pid).replace(/[^A-Za-z0-9]+/g, '');
    const table = list => {
      const w = Math.max(...list.map(x => x.shortEl.length), 4);
      return [`        | ${'item'.padEnd(w)} | detail |`, ...list.map(x => `        | ${x.shortEl.padEnd(w)} | ${x.value ? x.value.replace(/\|/g, '/') : ''} |`)];
    };
    // SHALL:handle — the operator proves the import outcome, then confirms each element was accepted.
    out.push(`      When Consumer submits evidence of "the import of ${what} completing without error (import log or screenshot)" as $handled${slug}Evidence`);
    out.push(`      Then Consumer confirms each of these is accepted for "${what}":`);
    out.push(...table(handle));
    if (display.length) {
      // SHOULD:display — the operator displays the elements, attaches a screenshot, then confirms each one.
      out.push(`      When Consumer is informed "Open ${refName}'s summary in the system under test and display ${what}."`);
      out.push(`      And Consumer submits evidence of "${what} displayed (screenshot)" as $displayed${slug}Evidence`);
      out.push(`      Then Consumer confirms each of these is displayed for "${what}":`);
      out.push(...table(display));
    }
    out.push('');
  }
  out.push(`  Rule: Documents with missing information are handled, not rejected`);
  out.push('');
  out.push(`    @profile:Composition-uv-ips`);
  out.push(`    ${Object.keys(REQUIRED_SECTIONS).map(s => `@covers:Composition.section:${s}.emptyReason`).join(' ')}`);
  out.push(`    Scenario: ips-consumer-900 Required sections with an emptyReason and a minimal document are accepted`);
  out.push(`      When Tester gets "${IPS_URL}/Bundle-${NO_INFO}.json" as $ipsNoInfo`);
  out.push(`      And Consumer is informed "Import this IPS, whose problems, allergies and medications sections carry an emptyReason instead of entries." with $ipsNoInfo`);
  out.push(`      And Consumer submits evidence of "the three required sections shown with no information (screenshot)" as $noInfoEvidence`);
  out.push(`      Then Consumer confirms each of these is accepted for "a document whose required sections carry an emptyReason":`);
  out.push(`        | item                                   | detail                  |`);
  for (const s of Object.keys(REQUIRED_SECTIONS)) out.push(`        | ${`section:${s}.emptyReason`.padEnd(38)} | shown as no information |`);
  out.push(`      When Tester gets "${IPS_URL}/Bundle-${MINIMAL}.json" as $ipsMinimal`);
  out.push(`      And Consumer is informed "Import this minimal IPS (required sections only, no optional elements)." with $ipsMinimal`);
  out.push(`      And Consumer submits evidence of "the minimal document imported without error (import log or screenshot)" as $minimalEvidence`);
  out.push(`      Then Consumer confirms each of these is accepted for "the minimal document":`);
  out.push(`        | item         | detail                 |`);
  out.push(`        | the document | imported without error |`);
  out.push('');
  out.push(`  Rule: A Consumer that is a FHIR server is driven directly`);
  out.push('');
  out.push(`    Scenario: ips-consumer-950 The document is accepted over the FHIR API`);
  out.push(`      # For a Consumer exposing a FHIR endpoint: declare it with an endpoint in the`);
  out.push(`      # Background ("Consumer is the system under test at ...") and the test bed`);
  out.push(`      # submits the document itself instead of asking a tester to import it.`);
  out.push(`      When Tester posts to Consumer at "/Bundle" with body $ips`);
  out.push(`      Then $response.status should be one of "200, 201"`);
  out.push('');
  fs.writeFileSync(path.join(FEATURES, 'ips-consumer.feature'), out.join('\n'), 'utf8');
}

// ─────────────────────────────────────────────────────────────────────
// 6. Self-test: every assertion holds on the reference examples
// ─────────────────────────────────────────────────────────────────────

function selftest(pkg) {
  const fhirpath = require('fhirpath');
  const model = require('fhirpath/fhir-context/r4');
  const cases = [
    { file: 'ips-creator.feature', bundle: loadExample(pkg, REFERENCE), only: l => !/ipsNoInfo/.test(l) },
    { file: 'ips-creator.feature', bundle: loadExample(pkg, NO_INFO), only: l => /ipsNoInfo/.test(l) },
  ];
  let pass = 0, fail = 0;
  for (const c of cases) {
    const text = fs.readFileSync(path.join(FEATURES, c.file), 'utf8');
    for (const [i, line] of text.split('\n').entries()) {
      const m = /^\s*(?:Then|And)\s+\$\w+ at "(.+)" should be (\S+)\s*$/.exec(line);
      if (!m || !c.only(line)) continue;
      const [, expr, expected] = m;
      let got;
      try { got = fhirpath.evaluate(c.bundle, expr, null, model); } catch (e) { got = ['ERROR ' + e.message]; }
      const ok = String(got[0]) === expected.replace(/"/g, '') && got.length === 1;
      if (ok) pass++; else { fail++; console.log(`  FAIL ${c.file}:${i + 1} on ${c.bundle.id}\n       ${expr}\n       got ${JSON.stringify(got).slice(0, 120)}`); }
    }
  }
  console.log(`selftest: ${pass} assertions hold on the reference examples, ${fail} do not`);
  return fail === 0;
}

// ─────────────────────────────────────────────────────────────────────
// 7. Coverage check
// ─────────────────────────────────────────────────────────────────────

function parseFeature(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const featureTags = [];
  const scenarios = [];
  let pending = [];
  let cur = null;
  let inDoc = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('"""')) { inDoc = !inDoc; continue; }
    if (inDoc) continue;
    if (line.startsWith('@')) { pending.push(...line.split(/\s+/)); continue; }
    if (/^Feature:/.test(line)) { featureTags.push(...pending); pending = []; continue; }
    if (/^Scenario:/.test(line)) { cur = { title: line.replace(/^Scenario:\s*/, ''), tags: pending, steps: [] }; scenarios.push(cur); pending = []; continue; }
    if (/^(Rule|Background):/.test(line)) { cur = null; pending = []; continue; }
    if (cur && /^(Given|When|Then|And|But)\s/.test(line)) cur.steps.push(line);
    // A data table belongs to the step above it: its rows are where a
    // checklist names the elements.
    else if (cur && line.startsWith('|') && cur.steps.length) cur.steps[cur.steps.length - 1] += '\n' + line;
  }
  const tag = (tags, name) => tags.filter(t => t.startsWith(`@${name}:`)).flatMap(t => t.slice(name.length + 2).split(','));
  return {
    file: path.basename(file),
    actors: tag(featureTags, 'actor'),
    scenarios: scenarios.map(s => ({ ...s, profile: tag(s.tags, 'profile')[0], covers: tag(s.tags, 'covers') })),
  };
}

function check(model) {
  const features = fs.readdirSync(FEATURES).filter(f => /^ips-.*\.feature$/.test(f)).map(f => parseFeature(path.join(FEATURES, f)));
  const results = [];
  const derived = Object.values(model.actors).filter(a => a.derivedFrom).map(a => [a.id, a.derivedFrom.split('/').pop().split('|')[0]]);
  for (const o of model.obligations) {
    const profile = model.profiles[o.profile];
    const segs = parseSegments(profile, o.element);
    const names = aliases(profile, o.element, segs);
    const candidates = features.filter(f => f.actors.includes(o.actor)).flatMap(f => f.scenarios.filter(s => s.profile === o.profile && s.covers.includes(o.element)).map(s => ({ ...s, file: f.file })));
    const mentioned = candidates.filter(s => s.steps.some(st => names.some(a => st.includes(a))));
    results.push({ ...o, status: mentioned.length ? 'covered' : candidates.length ? 'declared-only' : 'uncovered', by: mentioned[0] ? `${mentioned[0].file}: ${mentioned[0].title.split(' ')[0]}` : '' });
  }
  const counts = groupBy(results, r => r.status);
  for (const [k, v] of Object.entries(counts)) console.log(`${k}: ${v.length}`);
  for (const r of results.filter(r => r.status !== 'covered')) console.log(`  ${r.status.toUpperCase()} ${r.actor} ${r.profile} ${r.element} ${r.code}`);
  for (const [id, from] of derived) console.log(`actor ${id} derives from ${from}: inherits its ${results.filter(r => r.actor === from).length} obligations; ips-${id.toLowerCase()}.feature ${features.some(f => f.actors.includes(id)) ? 'exercises the transport' : 'MISSING'}`);
  // Matrix, for the record.
  const matrix = { spec: model.spec, generated: new Date().toISOString().slice(0, 10), actors: Object.keys(model.actors), obligations: results };
  fs.writeFileSync(COVERAGE, JSON.stringify(matrix, null, 1), 'utf8');
  return !results.some(r => r.status !== 'covered');
}

// ─────────────────────────────────────────────────────────────────────

const pkg = packageDir();
let ok = true;
if (cmd === 'extract' || cmd === 'all') {
  const model = extract(pkg);
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(model, null, 1), 'utf8');
  console.log(`extract: ${Object.keys(model.actors).length} actors, ${Object.keys(model.profiles).length} profiles, ${model.obligations.length} obligations → ${path.relative(APP, DATA)}`);
}
const model = readJson(DATA);
if (cmd === 'generate' || cmd === 'all') {
  const sc = writeCreator(model, pkg);
  writeConsumer(model, pkg);
  console.log(`generate: ips-creator.feature (${sc.length + 2} scenarios), ips-consumer.feature`);
}
if (cmd === 'selftest' || cmd === 'all') ok = selftest(pkg) && ok;
if (cmd === 'check' || cmd === 'all') ok = check(model) && ok;
process.exit(ok ? 0 : 1);
