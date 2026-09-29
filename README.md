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

### Getting set up

Two commands. The clone brings all six skills; the install brings the language
and the dialects.

```bash
git clone https://github.com/OpenTestBed/itb-plugin-authoring
cd itb-plugin-authoring

npm install @opentestbed/otb-gherkin             @opentestbed/dialect-fhir-validator             @opentestbed/dialect-hcert-decoder
```

Node 18 or newer. There is no `package.json` at the repo root and you do not
need one — npm creates a throwaway one, and everything it writes here is
ignored, so the checkout stays clean.

Then assemble the dialects into the directory the compiler reads, and check it
works:

```bash
npx otb-gherkin dialects --installed --out assets
npx otb-gherkin --version
```

`dialects --installed` finds packages carrying an `otbDialect` field in
`node_modules`, so the set is pinned by your lockfile and needs no network
afterwards. That is the whole setup.

**No Test Bed is involved.** Authoring, compiling and packaging a deployable
suite need nothing above. A Test Bed is only for executing tests, and the five
keys it wants are listed in
`.claude/skills/spec-to-tests/references/setup.md`.

### Starting work

Start an agent session in the clone and the skills are on its path. Ask for what
you want and the right one loads:

```
Read the specification at <path> and propose test cases for it
```

You can also read any `SKILL.md` and follow it by hand — they are written as
procedures, not as prompts.
[The worked example](#a-full-example-from-a-specification-to-a-test-ig) below
runs the whole path, from a specification to a packaged test IG.

<details>
<summary>Using a skill in another project</summary>

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

### The skills

| Skill | Use it when |
|---|---|
| `spec-to-tests` | Someone brings a specification and wants tests for it. Scope, agree the test kinds, author, compile, run |
| `write-test-feature` | Adding or changing a test case. The day-to-day job |
| `diagnose-test-failure` | A suite went red and you need to know whose fault it is |
| `spec-to-test-ig` | Publishing a finished suite as a FHIR TestPlan and implementation guide |

**`diagnose-test-failure` is the one that pays for itself.** Its single rule is
that you may not call something a defect in software you do not own until you
have reproduced it outside the test bed.

Two more skills exist for extending the language itself — adding a dialect for a
new service or domain, or changing the core grammar. You do not need them to
write tests. See [EXTENDING.md](EXTENDING.md).

## A full example: from a specification to a test IG

The whole path. Numbered steps are prompts to an agent in a session started in
the clone; code blocks are what gets run. Substitute your own specification
throughout.

The repository ships one worked case to compare against: the IPS suite, in
`app/public/features/ips-creator.feature`, `ips-consumer.feature` and
`ips-server.feature`, its config in `app/public/data/ips-test-ig.json`, and the
record of how it was produced in `app/public/features/IPS-TESTS.md`.

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

> Read the specification at `<path>` and tell me what is testable. Is it
> actor-scoped or profile-scoped? Propose a scope and say what the alternative
> would cover.

The agent reads the package, the profiles, the capability statements and the
examples, not the website. What comes back should say which of two shapes the
specification has, because they lead to different suites. **Actor-scoped**: it
names actors with their own obligations, so one test plan per actor and the
system under test plays one at a time. **Profile-scoped**: it constrains
resources and the question is whether an instance conforms.

It should also say what the specification does *not* give you. A guide with no
example instances means test data has to be generated rather than borrowed, and
that changes the work.

**3. Fix the scope.** The agent stops here and makes you choose, because the
options lead to genuinely different suites.

> Scope it to `<the actor or the profile you care about>`. Write the scope
> sentence down, and say what is out of scope.

**4. Choose the kinds of test.**

> Which kinds of test should this round include? Show me the catalogue and your
> recommendation, then give me a case list with the requirement each one covers.

Positive paths are assumed. The question is whether negative, boundary,
value-set binding and operator-attested cases are in. Negative tests are where
most real defects surface and the most commonly skipped, so decide about them
deliberately rather than by omission.

Insist on the case list before any Gherkin exists: a list is cheap to change and
a suite is not.

**5. Author.**

> Approved, with `<any changes to the list>`. Write the features.

**6. Compile.** The gate: non-zero on any error, every diagnostic printed.

> Compile them and fix everything, including the warnings.

```bash
ITB_ASSET_ROOT=./assets npx otb-gherkin compile app/public/features/ --out build --zip suite.zip
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

> Package these as a FHIR IG with the features as TestPlans.

```bash
node app/scripts/build-test-ig.mjs app/public/data/<spec>-test-ig.json --package
```

The config names the IG, the specification under test, and the plans; one plan is
one TestPlan, meaning a scope and its test cases. A plan takes its cases either
as one `feature` whose `Rule:` groupings become suites — the shape for an
actor-scoped specification — or as a `features` folder where each file becomes a
suite. Model yours on `app/public/data/ips-test-ig.json`.

The builder writes `sushi-config.yaml`, one TestPlan FSH per plan, the Binaries
that render the Gherkin, the pages and the scaffold. `--package` runs SUSHI and
produces `dist/package.tgz`. The output goes to its own directory outside this
repository, to be committed as its own guide.

**9. Hand it over.**

> Write the README: the scope sentence, the confirmed case list with requirement
> references, the compile and run output with dates and builds, and what is not
> covered and why.

That last item is the one people skip and reviewers need. A suite that does not
say what it leaves out reads as a claim of completeness it cannot support.
`app/public/features/IPS-TESTS.md` is what one looks like.

### The vocabulary

`app/public/lang/` documents the language. Two files are generated — regenerate
rather than editing them.

| File | What |
|---|---|
| `EXPRESSIONS.md` | Every sentence the language accepts, one filled-in example each. Generated by `npm run gen:language-docs` |
| `GENERATIONS.md` | Generation 1 against generation 2: what changed, why, how to migrate |
| `TUTORIAL.md`, `GRAMMAR.md`, `REFERENCE.md` | The long-form introduction, the formal grammar, the step reference |


### Checking your work

```bash
# the feature you changed, or a folder; exits non-zero on any error
ITB_ASSET_ROOT=./assets npx otb-gherkin compile app/public/features/<file>.feature
```

Add `--verbose` for warnings. Read those too: an undeclared actor or a dialect
that is not enabled shows up there and is usually the real problem.

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
