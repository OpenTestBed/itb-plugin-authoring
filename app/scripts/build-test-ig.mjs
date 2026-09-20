#!/usr/bin/env node
// Build a FHIR IG that publishes a set of Gherkin features as TestPlans —
// the pharm-MEOW-test layout, generated from a config and the features.
//
//   node scripts/build-test-ig.mjs <config.json> [--package]
//
// The config names the IG, the specification under test and its actors, and
// which feature file tests each actor. From that this writes:
//
//   <out>/sushi-config.yaml               IG metadata, dependencies, resources, pages, parameters
//   <out>/input/fsh/testplan-<actor>.fsh  one TestPlan per actor: a suite per Rule, a test
//                                         per Scenario, an assertion per Then step, and the
//                                         @covers: obligations in each test's description
//   <out>/input/fsh/binary-gherkin.fsh    the Binary that renders each feature on the site
//   <out>/input/testing/gherkin/*.feature the features, as shipped to runners (path-test)
//   <out>/input/pagecontent/index.md, testing.md, README.md
//   + the scaffolding vendored in scripts/test-ig-scaffold/ (build scripts, template, CI)
//
// --package then runs the scaffold's _package.py (SUSHI + resourceDefinition
// repair + tarball) so <out>/dist/package.tgz is ready to hand to a runner.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, '..');
const SCAFFOLD = path.join(here, 'test-ig-scaffold');

const args = process.argv.slice(2);
const configPath = args.find(a => !a.startsWith('--'));
if (!configPath) { console.error('usage: build-test-ig.mjs <config.json> [--package]'); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const OUT = path.resolve(path.dirname(configPath), cfg.out);
const FEATURES = path.resolve(APP, cfg.features ?? 'public/features');
const today = new Date().toISOString().slice(0, 10);

// ─────────────────────────────────────────────────────────────────────
// Feature → plan model
// ─────────────────────────────────────────────────────────────────────

function parseFeature(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const f = { file: path.basename(file), title: '', description: [], tags: [], background: [], rules: [] };
  let pending = [], comments = [], rule = null, sc = null, inDoc = false, inPreamble = false;
  const suite = () => rule ?? (rule = { title: 'Test cases', scenarios: [] }, f.rules.push(rule), rule);
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('"""')) { inDoc = !inDoc; continue; }
    if (inDoc) continue;
    if (line.startsWith('#')) { comments.push(line.replace(/^#\s?/, '')); continue; }
    if (line === '') { if (!inPreamble) comments = []; continue; }
    if (line.startsWith('@')) { pending.push(...line.split(/\s+/)); continue; }
    if (/^Feature:/.test(line)) { f.title = line.replace(/^Feature:\s*/, ''); f.tags = pending; pending = []; comments = []; inPreamble = true; continue; }
    if (/^Background:/.test(line)) { inPreamble = false; sc = null; comments = []; continue; }
    if (/^Rule:/.test(line)) { inPreamble = false; rule = { title: line.replace(/^Rule:\s*/, ''), scenarios: [] }; f.rules.push(rule); sc = null; comments = []; continue; }
    if (/^Scenario:/.test(line)) {
      inPreamble = false;
      sc = { title: line.replace(/^Scenario:\s*/, ''), tags: pending, description: comments.join(' '), steps: [], covers: [], profile: undefined };
      sc.covers = pending.filter(t => t.startsWith('@covers:')).flatMap(t => t.slice(8).split(','));
      sc.profile = pending.find(t => t.startsWith('@profile:'))?.slice(9);
      suite().scenarios.push(sc);
      pending = []; comments = [];
      continue;
    }
    if (inPreamble) { f.description.push(line); continue; }
    const m = /^(Given|When|Then|And|But)\s+(.*)$/.exec(line);
    if (m && sc) { sc.steps.push({ kw: m[1], text: m[2], note: comments.join(' ') }); comments = []; continue; }
    if (m && !sc) { f.background.push({ kw: m[1], text: m[2] }); comments = []; }
  }
  return f;
}

/** Assertions are the Then steps and the And/But steps that follow one. */
function assertions(sc) {
  const out = [];
  let inThen = false;
  for (const s of sc.steps) {
    if (s.kw === 'Then') inThen = true;
    else if (s.kw === 'Given' || s.kw === 'When') inThen = false;
    if (inThen) out.push(s);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// FSH
// ─────────────────────────────────────────────────────────────────────

const fsh = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const fshBlock = s => `"""\n${String(s).replace(/"""/g, '\\"\\"\\"')}\n"""`;
const idOf = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const nameOf = s => s.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join('');

function testPlanFsh(actor, feature) {
  const id = `${actor.id}-tests`;
  const covered = feature.rules.flatMap(r => r.scenarios).flatMap(s => s.covers).length;
  const lines = [];
  lines.push(`// GENERATED by build-test-ig.mjs from ${feature.file}. Edit the feature, not this file.`);
  lines.push(`//`);
  lines.push(`// TestPlan comes from hl7.fhir.uv.testing (an "additional resource" for this FHIR`);
  lines.push(`// version); _package.py injects the root-level resourceDefinition after SUSHI runs.`);
  lines.push(`Instance: ${id}`);
  lines.push(`InstanceOf: TestPlan`);
  lines.push(`Usage: #definition`);
  lines.push(`Title: "${fsh(actor.title)} Test Plan"`);
  lines.push(`Description: "${fsh(actor.description ?? `Test plan for the ${actor.title} actor of ${cfg.spec.title}.`)}"`);
  lines.push('');
  lines.push(`* url = "${cfg.canonical}/TestPlan/${id}"`);
  lines.push(`* version = "${cfg.version}"`);
  lines.push(`* name = "${nameOf(actor.title)}TestPlan"`);
  lines.push(`* title = "${fsh(actor.title)} Test Plan"`);
  lines.push(`* status = #draft`);
  lines.push(`* experimental = true`);
  lines.push(`* date = "${today}"`);
  lines.push(`* publisher = "${fsh(cfg.publisher.name)}"`);
  lines.push(`* contact`);
  lines.push(`  * name = "${fsh(cfg.publisher.name)}"`);
  if (cfg.publisher.url) { lines.push(`  * telecom`); lines.push(`    * system = #url`); lines.push(`    * value = "${cfg.publisher.url}"`); }
  lines.push('');
  const desc = [
    `Test plan for the **${actor.title}** actor of [${cfg.spec.title}](${cfg.spec.site}).`,
    '',
    ...feature.description.map(l => l),
    '',
    `Each \`suite\` below is a \`Rule:\` of the Gherkin feature named by \`suite.input.file\`, and each \`suite.test\` one of its \`Scenario:\` lines, matched by the scenario's identifier. The assertions are the scenario's \`Then\` steps, verbatim.`,
    covered ? `The tests declare which specification obligations they cover (${covered} element obligations across the plan); the coverage matrix is checked mechanically against the specification package.` : '',
  ].filter(Boolean).join('\n');
  lines.push(`* description = ${fshBlock(desc)}`);
  lines.push(`* purpose = "To declare, in a machine-readable and runnable form, which behaviours a system claiming conformance to the ${fsh(actor.title)} actor must demonstrate."`);
  lines.push('');
  lines.push(`// What is under test.`);
  lines.push(`* scope`);
  lines.push(`  * reference = "${actor.scope}"`);
  lines.push(`  * description = "${fsh(actor.scopeDescription ?? `${actor.title} — the system under test.`)}"`);
  lines.push('');
  lines.push(`* runner = "${cfg.runner ?? 'https://www.itb.ec.europa.eu/docs/guides/latest/'}"`);
  let si = 0;
  for (const rule of feature.rules) {
    if (!rule.scenarios.length) continue;
    lines.push('');
    lines.push(`* suite[${si === 0 ? '0' : '+'}]`);
    lines.push(`  * name = "${fsh(rule.title)}"`);
    lines.push(`  * description = "Rule: ${fsh(rule.title)} — the scenarios grouped under it in the feature file."`);
    lines.push(`  * input`);
    lines.push(`    * name = "gherkin-script"`);
    lines.push(`    * file = "${feature.file}"`);
    let ti = 0;
    for (const sc of rule.scenarios) {
      lines.push(`  * test[${ti === 0 ? '0' : '+'}]`);
      lines.push(`    * name = "${fsh(sc.title)}"`);
      const d = [sc.description, sc.covers.length ? `Covers ${sc.profile ? sc.profile + ': ' : ''}${sc.covers.join(', ')}.` : ''].filter(Boolean).join(' ');
      if (d) lines.push(`    * description = "${fsh(d)}"`);
      lines.push(`    * operation = #gherkin/Scenario`);
      let ai = 0;
      for (const a of assertions(sc)) {
        lines.push(`    * assertion[${ai === 0 ? '0' : '+'}]`);
        lines.push(`      * severity = #error`);
        lines.push(`      * human = "${fsh(a.note ? `${a.note}: ${a.text}` : a.text)}"`);
        ai++;
      }
      ti++;
    }
    si++;
  }
  return lines.join('\n') + '\n';
}

function binaryFsh(actors) {
  const out = [`// ===== RENDERING ONLY — delete with the Binary resource entries in sushi-config.yaml =====`,
    `// The Gherkin ships to runners as raw .feature files under package/tests/ via the`,
    `// path-test parameter. These Binaries only make each script render as a`,
    `// syntax-highlighted page on the IG site ("ig-loader-<file>" inlines the file).`];
  for (const a of actors) {
    out.push('', `Instance: ${a.id}-gherkin-script`, `InstanceOf: Binary`, `Usage: #definition`, `* language = #en`, `* contentType = #text/x-gherkin`, `* data = "ig-loader-${a.feature}"`);
  }
  return out.join('\n') + '\n';
}

// ─────────────────────────────────────────────────────────────────────
// sushi-config.yaml and pages
// ─────────────────────────────────────────────────────────────────────

function sushiConfig(actors) {
  const y = [];
  y.push(`# GENERATED by build-test-ig.mjs. Regenerate rather than edit.`);
  y.push(`id: ${cfg.id}`);
  y.push(`canonical: ${cfg.canonical}`);
  y.push(`url: ${cfg.canonical}/ImplementationGuide/${cfg.id}`);
  y.push(`name: ${cfg.name}`);
  y.push(`title: "${cfg.title}"`);
  y.push(`description: >-`);
  y.push(`  ${cfg.description}`);
  y.push(`status: active`);
  y.push(`license: ${cfg.license ?? 'CC0-1.0'}`);
  y.push(`date: ${today}`);
  y.push(`version: ${cfg.version}`);
  y.push(`fhirVersion: ${cfg.fhirVersion ?? '6.0.0-ballot5'}`);
  y.push(`copyrightYear: ${today.slice(0, 4)}+`);
  y.push(`releaseLabel: ci-build`);
  y.push(`publisher:`);
  y.push(`  name: ${cfg.publisher.name}`);
  y.push(`contact:`);
  y.push(`  - name: ${cfg.publisher.name}`);
  if (cfg.publisher.url) { y.push(`    telecom:`); y.push(`      - system: url`); y.push(`        value: ${cfg.publisher.url}`); }
  y.push(`jurisdiction: http://unstats.un.org/unsd/methods/m49/m49.htm#001 "World"`);
  y.push('');
  y.push(`# TestPlan lives in the FHIR Testing IG (removed from R6 core at 6.0.0-ballot5).`);
  y.push(`dependencies:`);
  y.push(`  hl7.fhir.uv.testing: current`);
  y.push(`  # The specification whose actors these plans test — tracking only, so the`);
  y.push(`  # canonicals the plans point at resolve. A cross-version reference when the`);
  y.push(`  # spec is R4: only canonicals are used, no profiles are derived.`);
  y.push(`  ${cfg.spec.id}:`);
  y.push(`    id: ${cfg.spec.alias ?? 'spec'}`);
  y.push(`    uri: ${cfg.spec.uri}`);
  y.push(`    version: ${cfg.spec.version}`);
  y.push('');
  y.push(`resources:`);
  y.push(`  # TestPlan is an "additional resource": the publisher needs a root-level`);
  y.push(`  # resourceDefinition that FSH cannot emit; _package.py injects it after SUSHI.`);
  for (const a of actors) {
    y.push(`  TestPlan/${a.id}-tests:`);
    y.push(`    name: ${a.title} Test Plan`);
    y.push(`    description: Declares the Gherkin test cases for the ${a.title} actor of ${cfg.spec.title}.`);
    y.push(`    exampleBoolean: false`);
  }
  y.push(`  # ===== RENDERING ONLY — delete this block, path-binary below, and input/fsh/binary-gherkin.fsh together`);
  for (const a of actors) {
    y.push(`  Binary/${a.id}-gherkin-script:`);
    y.push(`    name: ${a.title} Gherkin Script`);
    y.push(`    description: Gherkin feature file with the test scenarios for the ${a.title} actor.`);
    y.push(`    exampleBoolean: false`);
    y.push(`    extension:`);
    y.push(`      - url: http://hl7.org/fhir/tools/StructureDefinition/implementationguide-resource-format`);
    y.push(`        valueCode: text/x-gherkin`);
  }
  y.push(`  # ===== END RENDERING ONLY`);
  y.push('');
  y.push(`pages:`);
  y.push(`  index.md:`);
  y.push(`    title: Home`);
  y.push(`  testing.md:`);
  y.push(`    title: Testing`);
  if (cfg.processPage) { y.push(`  process.md:`); y.push(`    title: Method`); }
  y.push(`  changes.xml:`);
  y.push(`  downloads.xml:`);
  y.push('');
  y.push(`menu:`);
  y.push(`  Home: index.html`);
  y.push(`  Testing: testing.html`);
  if (cfg.processPage) y.push(`  Method: process.html`);
  y.push(`  Artifacts: artifacts.html`);
  y.push(`  Downloads: downloads.html`);
  y.push(`  Changes: changes.html`);
  y.push('');
  y.push(`parameters:`);
  y.push(`  # path-test mirrors input/testing into package/tests/: the .feature files travel`);
  y.push(`  # as Gherkin, and a runner resolves TestPlan.suite.input.file against them.`);
  y.push(`  path-test: input/testing`);
  y.push(`  incubator-ig: hl7.fhir.uv.testing`);
  y.push(`  # RENDERING ONLY — resolves the "ig-loader-<file>" data of the Binaries.`);
  y.push(`  path-binary: input/testing/gherkin`);
  y.push('');
  y.push(`FSHOnly: false`);
  return y.join('\n') + '\n';
}

function indexMd(actors, features) {
  const rows = actors.map(a => `* **[${a.title} Test Plan](TestPlan-${a.id}-tests.html)** — ${a.summary ?? ''} ([Gherkin](Binary-${a.id}-gherkin-script.html))`).join('\n');
  return `<a name="scope"> </a>

${cfg.description}

<blockquote class="stu-note">
<strong>${cfg.disclaimer ?? 'This is not an approved test specification.'}</strong>
It exists to exercise the tooling: the TestPlan resource, the Gherkin scripts, the
mechanical coverage of the specification's obligations, and the packaging of all three.
</blockquote>

### What is here
<a name="content"> </a>

| | |
| --- | --- |
| [Testing](testing.html) | How the test plans are derived from the specification's actors and obligations, how the Gherkin scripts are pointed at and packaged, and how they are rendered here. |
${cfg.processPage ? '| [Method](process.html) | The step-by-step record of how these tests were produced and checked. |\n' : ''}| [Artifacts](artifacts.html) | The TestPlan resources, one per actor, and the Gherkin scripts they name. |
| [Downloads](downloads.html) | The published package, including the raw \`.feature\` files under \`tests/gherkin/\`. |

One test plan per actor of [${cfg.spec.title}](${cfg.spec.site}):

${rows}

All are written for the [Interoperability Test Bed](https://www.itb.ec.europa.eu/docs/guides/latest/) in the OTB Gherkin language (generation 2).

<a name="navigation"> </a>

The top menu navigates the sections, and a [Table of Contents](toc.html) lists the full content.
`;
}

function testingMd(actors, features) {
  const rows = actors.map(a => {
    const f = features[a.id];
    const n = f.rules.flatMap(r => r.scenarios).length;
    const cov = f.rules.flatMap(r => r.scenarios).flatMap(s => s.covers).length;
    return `| [${a.title} Test Plan](TestPlan-${a.id}-tests.html) | [${a.title}](${a.scope}) | ${n} scenarios${cov ? `, ${cov} element obligations covered` : ''} | \`${a.feature}\` |`;
  }).join('\n');
  return `<a name="scope"> </a>

### Testing the ${cfg.spec.title} actors

This guide declares its tests with the [TestPlan](https://build.fhir.org/ig/HL7/fhir-testing-ig/en/StructureDefinition-TestPlan.html) resource from the [FHIR Testing IG](https://build.fhir.org/ig/HL7/fhir-testing-ig/en/) (\`hl7.fhir.uv.testing\`), one plan per actor the specification defines. Each plan's \`scope\` names the actor — what is under test — and each of its tests is one \`Scenario:\` of a Gherkin feature file that the plan points at through \`suite.input.file\`.

| Test plan | Actor under test | Content | Feature file |
| --------- | ---------------- | ------- | ------------ |
${rows}

<a name="obligations"> </a>

### From obligations to test cases

The specification states its expectations as **obligations** on profile elements (the \`obligation\` extension): which actor must populate, be able to populate, handle or display which element, and how strongly. The test cases are derived from that list, not written from a reading of the narrative:

| Obligation | Test pattern |
| ---------- | ------------ |
| \`SHALL:populate\` | The element is present in every instance the Creator produces. |
| \`SHALL:populate-if-known\` | The element is present wherever the reference dataset the system was loaded with has it. |
| \`SHALL:able-to-populate\`, \`SHOULD:able-to-populate\` | Present in the produced document; where the reference data cannot exercise it, the tester attests the capability. |
| \`MAY:able-to-populate\` | Recorded in the test, not asserted. |
| \`SHALL:handle\` | The Consumer accepts a document carrying the element without error. |
| \`SHOULD:display\` | The Consumer shows the element to a human; the tester names the ones it does not, and each is asserted separately. |

Every scenario declares the profile and elements it covers (\`@profile:\`, \`@covers:\` tags) and must mention each element in a step; a script checks both against the specification package, so an obligation cannot be silently dropped when the specification or the tests change. The assertions themselves are self-tested against the specification's own example documents before they are published.

<a name="gherkin"> </a>

### The Gherkin feature files

The executable test cases live under \`input/testing/gherkin/\`, one feature per actor. They ship **as Gherkin, not as a FHIR resource**: the \`path-test\` parameter mirrors the test tree into the published package under \`package/tests/gherkin/\`, which is what a test runner consumes. \`TestPlan.suite.input.file\` names the file, and each \`suite.test\` matches a \`Scenario:\` by its identifier.

The Binary resources on this site exist only so the scripts render as syntax-highlighted pages; removing them changes nothing for a runner.
`;
}

function readmeMd(actors) {
  return `${cfg.title}
---

${cfg.description}

**${cfg.disclaimer ?? 'This is not an approved test specification.'}** It exists to exercise the tooling.

GENERATED by \`itb-plugin-authoring/app/scripts/build-test-ig.mjs\` from the feature files; regenerate rather than edit the generated files.

### What is in here

| Path | |
| --- | --- |
${actors.map(a => `| \`input/fsh/testplan-${a.id}.fsh\` | TestPlan for the ${a.title} |`).join('\n')}
| \`input/testing/gherkin/*.feature\` | The Gherkin scripts the plans point at, for the [Interoperability Test Bed](https://www.itb.ec.europa.eu/docs/guides/latest/) |
| \`input/fsh/binary-gherkin.fsh\` | Binaries that render the scripts on the IG site (presentational only) |
| \`_package.py\` | Builds \`dist/package.tgz\` from SUSHI output without the IG Publisher |

### Building

\`\`\`
python _package.py    # sushi + package only, no publisher -> dist/package.tgz
_genonce.sh           # or _genonce.bat: the full IG Publisher build
\`\`\`
`;
}

// ─────────────────────────────────────────────────────────────────────

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

const actors = cfg.actors;
const features = {};
for (const a of actors) features[a.id] = parseFeature(path.join(FEATURES, a.feature));

fs.mkdirSync(OUT, { recursive: true });
copyDir(SCAFFOLD, OUT);
fs.mkdirSync(path.join(OUT, 'input', 'fsh'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'input', 'testing', 'gherkin'), { recursive: true });
for (const d of ['examples', 'extensions', 'images', 'images-source', 'models', 'profiles', 'resources', 'vocabulary']) fs.mkdirSync(path.join(OUT, 'input', d), { recursive: true });

fs.writeFileSync(path.join(OUT, 'sushi-config.yaml'), sushiConfig(actors));
for (const a of actors) {
  fs.writeFileSync(path.join(OUT, 'input', 'fsh', `testplan-${a.id}.fsh`), testPlanFsh(a, features[a.id]));
  fs.copyFileSync(path.join(FEATURES, a.feature), path.join(OUT, 'input', 'testing', 'gherkin', a.feature));
}
fs.writeFileSync(path.join(OUT, 'input', 'fsh', 'binary-gherkin.fsh'), binaryFsh(actors));
fs.writeFileSync(path.join(OUT, 'input', 'pagecontent', 'index.md'), indexMd(actors, features));
fs.writeFileSync(path.join(OUT, 'input', 'pagecontent', 'testing.md'), testingMd(actors, features));
if (cfg.processPage) fs.copyFileSync(path.resolve(path.dirname(configPath), cfg.processPage), path.join(OUT, 'input', 'pagecontent', 'process.md'));
fs.writeFileSync(path.join(OUT, 'README.md'), readmeMd(actors));
// The scaffold's ig.ini names the IG file by id.
fs.writeFileSync(path.join(OUT, 'ig.ini'), fs.readFileSync(path.join(SCAFFOLD, 'ig.ini'), 'utf8').replace(/ImplementationGuide-[^\s]+\.json/, `ImplementationGuide-${cfg.id}.json`));

console.log(`wrote ${path.relative(process.cwd(), OUT) || OUT}: sushi-config.yaml, ${actors.length} TestPlan(s), ${actors.length} feature(s), pages`);

if (args.includes('--package')) {
  console.log('== _package.py ==');
  execSync('python _package.py', { cwd: OUT, stdio: 'inherit' });
}
