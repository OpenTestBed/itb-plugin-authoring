# itb-plugin-authoring

Two things live here, and they have different prerequisites.

**The skills** — written procedures for deriving tests from a specification,
authoring features, diagnosing failures and extending the language. These need
Node and nothing else. **No Interoperability Test Bed, no Docker.** Start at
[Skills](#skills).

**The app** — a workbench and a test manager that run *inside* an ITB
installation as a functionality plugin. These need a Test Bed. See
[Running the app](#running-the-app-optional), which is optional and not the
first step.

A Test Bed is only required to **execute** tests. Writing them, compiling them
and packaging a deployable suite need none of it.

## Skills

`.claude/skills/` holds the procedures for the recurring jobs here. Each was
written against the code rather than the prose docs, and each is meant to be
followed literally, by a person or by an agent.

### Using them

If you cloned this repository, you already have them. Start an agent session
here and they are on the path — ask for what you want and the right one loads:

```
Read the specification at <path> and propose test cases for it
```

You can also read any `SKILL.md` yourself and follow it by hand. They are
written as procedures, not as prompts.

[The worked example](#a-full-example-from-a-specification-to-a-test-ig) below
runs the whole path, from a specification to a packaged test IG.

<details>
<summary>Using them in another project</summary>

Copy the directory. `spec-to-tests` is self-contained: it carries its own
scripts, depends only on the published `@opentestbed/otb-gherkin` package and on
the Test Bed's documented REST API, and needs neither this repository nor the
OpenTestBed CLI.

```bash
cp -r itb-plugin-authoring/.claude/skills/spec-to-tests  my-project/.claude/skills/
```

The other five reference paths inside this repository, so they are worth reading
rather than copying.

</details>

### What you need

Node 18 or newer, and the language:

```bash
npm install @opentestbed/otb-gherkin
npm install @opentestbed/dialect-fhir-validator @opentestbed/dialect-hcert-decoder
```

A Test Bed is **optional**. Authoring, compiling and packaging a deployable
suite need nothing else. Connect one only to execute the tests; the five keys it
wants are listed in `.claude/skills/spec-to-tests/references/setup.md`.

### The skills

| Skill | Use it when |
|---|---|
| `spec-to-tests` | Someone brings a specification and wants tests for it. Scope, agree the test kinds, author, compile, run |
| `write-test-feature` | Adding or changing a test case. The day-to-day job |
| `diagnose-test-failure` | A suite went red and you need to know whose fault it is |
| `add-language-dialect` | Teaching the language a new service or domain |
| `change-core-language` | A new comparator, sentence shape or placeholder. Rare |
| `spec-to-test-ig` | Publishing a finished suite as a FHIR TestPlan and implementation guide |

Two notes on choosing. **Adding verbs is not a core change** — new verbs, actor
kinds and value types belong in a dialect, while `change-core-language` touches
the grammar and makes every project recompile. And **`diagnose-test-failure` is
the one that pays for itself**: its single rule is that you may not call
something a defect in software you do not own until you have reproduced it
outside the test bed.

## A full example: from a specification to a test IG

The whole path, using the WHO ICVP guide. Numbered steps are prompts to an agent
in a session started in this repository. Code blocks are what gets run.

**1. Check the ground.**

> Confirm I can author tests here: which dialects are available and what version
> of the language. Tell me whether a test bed is configured, but do not set one
> up — I only need it later, to execute.

```bash
npx otb-gherkin dialects --installed --out assets
```

Setup gaps surface here rather than at the run gate, which is where they
otherwise bite.

**2. Read the specification.**

> Read the WHO ICVP build at `<path>/smart-icvp` and tell me what is testable.
> Is it actor-scoped or profile-scoped? Propose a scope and say what the
> alternative would cover.

Expect: ICVP declares no actors and no capability statements, so it is
profile-scoped. Its substance is four IPS resource profiles, nine logical models
describing the QR payload, and seven StructureMaps forming a QR to claim to
logical model to IPS chain. It ships no example instances of the resource
profiles, so test data has to be generated rather than borrowed.

**3. Fix the scope.** The agent stops here and makes you choose, because the
options lead to genuinely different suites.

> Scope it to the conversion pipeline: the StructureMaps from QR through claim
> to IPS, ending in conformance against `Bundle-uv-ips-ICVP`. Write the scope
> sentence down.

**4. Choose the kinds of test.**

> Which kinds of test should this round include? Show me the catalogue and your
> recommendation, then give me a case list with the requirement each one covers.

Positive paths are assumed. The question is whether negative, boundary,
value-set binding and operator-attested cases are in. Insist on the case list
before any Gherkin exists: a list is cheap to change and a suite is not.

**5. Author.**

> Approved, with the negative cases for a vaccine product id outside
> `ICVPProductIds`. Write the features.

`ICVPProductIds` is the only required binding in the ICVP build, on
`ICVPMinVaccineDetails.vp`, and it is the same field `ICVPProductIdToVaccineType`
translates — so it is the natural place for a must-reject case.

**6. Compile.** The gate: non-zero on any error, every diagnostic printed.

> Compile them and fix everything, including the warnings.

```bash
ITB_ASSET_ROOT=./assets npx otb-gherkin compile features/ --out build --zip suite.zip
```

**7. Run — the one step that needs a Test Bed.** Skip it if you have none: steps
1 to 6 and step 8 all work without one, and you still end up with a packaged IG.
But compiling only proves the suite is well formed, and nothing whatever about
the system under test, so a suite that has never run has established nothing.

> Deploy to the test bed and run every case. If anything fails, localise it
> before telling me it is a defect.

```bash
node .claude/skills/spec-to-tests/scripts/run-on-itb.mjs deploy build/suite.zip
node .claude/skills/spec-to-tests/scripts/run-on-itb.mjs run <testCaseId>
```

A session ending `UNDEFINED` is not a pass — it means nobody answered the
dialog. A failure hands over to `diagnose-test-failure` rather than to a
conclusion.

**8. Package as a FHIR IG.**

> Package these as a FHIR IG with the features as TestPlans, output to
> `<path>/smart-icvp-test`.

```bash
node app/scripts/build-test-ig.mjs app/public/data/icvp-test-ig.json --package
```

The config names the IG, the specification under test, and the plans; one plan
is one TestPlan, meaning a scope and its test cases. Take
`app/public/data/ips-test-ig.json` as the model. The builder writes
`sushi-config.yaml`, one TestPlan FSH per plan, the Binaries that render the
Gherkin, the pages and the scaffold. `--package` runs SUSHI and produces
`dist/package.tgz`.

**9. Hand it over.**

> Write the README: the scope sentence, the confirmed case list with requirement
> references, the compile and run output with dates and builds, and what is not
> covered and why.

That last item is the one people skip and reviewers need. A suite that does not
say what it leaves out reads as a claim of completeness it cannot support.

### The vocabulary

`app/public/lang/` documents the language. Two files are generated — regenerate
rather than editing them.

| File | What |
|---|---|
| `EXPRESSIONS.md` | Every sentence the language accepts, one filled-in example each. Generated by `npm run gen:language-docs` |
| `GENERATIONS.md` | Generation 1 against generation 2: what changed, why, how to migrate |
| `TUTORIAL.md`, `GRAMMAR.md`, `REFERENCE.md` | The long-form introduction, the formal grammar, the step reference |

`add-language-dialect` ships a `reference.md` with the action vocabulary, the
`$N` substitution rules and the full list of traps. Read it before writing
actions: the `CatalogAction` type in the compiler source is stale and omits
fields the compiler does read.

### Checking your work

```bash
# one feature, or a folder; exits non-zero on any error
ITB_ASSET_ROOT=./assets npx otb-gherkin compile app/public/features/<file>.feature

# the language itself still emits identical TDL (run in ../itb-cli)
npm test --workspace packages/gherkin

# a plugin or the registry is well formed
node ../itb-plugins/scripts/registry-validate.mjs ../itb-plugin-<name>
node ../itb-plugins/scripts/registry-validate.mjs ../itb-plugins
```

The registry check also cross-checks against what is on disk when the plugin
repos sit beside it: a plugin missing from the index, a required capability with
no spec, an orphan capability. Those checks are skipped rather than failed when
the siblings are absent, so the same command works in CI.

One caveat on `app/public/features/`: it is not green as a whole and is not a
gate. Every maintained suite in it compiles — IPS, MHD, RACSEL, MEOW, SPENSER,
terminology, certificate governance. Alongside them sit about twenty older
sample files with no `@lang:` tag whose steps belong to no released generation
of the language, `tutorial.feature` and `language-showcase.feature` among them.
They compile under neither generation, and adding a tag does not rescue them.
Check the file you are working on rather than the folder.

## Running the app (optional)

Only needed to use the graphical tools and to execute tests. Everything above
works without any of this.

The app is a **functionality plugin**: it extends an ITB installation rather
than the test language, and serves two things.

- **/** — the Gherkin workbench. Monaco editor, dialect-aware step catalogue on
  Ctrl+Space, live problems as you type, the compiled suite XML beside your
  feature, and a deploy button.
- **/manager** — the test manager. Pick a feature, then Compile, Init, Deploy,
  Run or Status. Every button shells out to the mounted `itb-cli` one-to-one, so
  the CLI and the UI cannot disagree.

### With docker compose, next to the ITB core

```powershell
cd itb-starter
docker compose -f docker-compose.yml `
  -f ..\itb-plugin-fhir-validator\compose.plugin.yml `
  -f ..\itb-plugin-hcert-decoder\compose.plugin.yml `
  -f ..\itb-plugin-authoring\compose.plugin.yml up -d --build
```

Then: http://localhost:10004 (workbench) and http://localhost:10004/manager.
The image build compiles the SPA (npm inside docker build — no local npm needed).

### Layout

| Path | What |
|---|---|
| `itb-plugin.yaml` | manifest (`kind: functionality`, no dialect, no GITB handler) |
| `compose.plugin.yml` | the service fragment; mounts `../itb-cli` at `/cli` |
| `Dockerfile` | stage 1 vite-builds `app/`, stage 2 runs `server.mjs` (no npm deps) |
| `server.mjs` | static SPA + `/manager` + `/api/cli` (allowlisted itb-suite commands) + `/itb-proxy` (same contract as the Vite dev proxy) |
| `app/` | the workbench sources; `itb-cli` syncs plugin dialects into `app/public/components/` (`sync-dialects.mjs`) |
| `.claude/skills/` | the procedures — see [Skills](#skills) |

### Dev mode (hot reload)

```powershell
cd app
npm install
npm run dev        # Vite dev server with the same /itb-proxy middleware
```
