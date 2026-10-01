# Extending the language

For people who need the language to say something it cannot say yet. If you are
writing tests, you do not need this file — see [README.md](README.md).

Two skills cover it, and the first question is which one you are in.

| Skill | Use it when |
|---|---|
| `add-language-dialect` | Teaching the language a new service or domain: verbs, actor kinds, value types, a conformance handler |
| `change-core-language` | A new comparator, sentence shape, placeholder type or well-known reference. Rare |

## Which one

**Almost always the dialect.** A dialect adds verbs, actor kinds, value types
with their path language, and at most one conformance handler. It needs no
change to the core, no release of the language package, and nothing else
recompiles. A new service to talk to, a new document format to read, a new
domain of checks — all dialect work.

**The core is for the grammar itself.** A new comparator, a new sentence shape,
a new placeholder type, a new well-known reference. It touches every project
that uses the language, so it is governed: see `GOVERNANCE.md` in the language
package for the proposal procedure, the review rules and the style rules a
reviewer applies.

There is one honest trap in between. A dialect *appears* able to add `refs:` and
`pathEvaluators:`, because the YAML loader reads them, but the merge silently
ignores both. Only the core can define a well-known reference or a path
evaluator. That is a real reason to end up in `change-core-language` when you
thought you were writing a dialect.

## Before you start on a dialect

`add-language-dialect` ships a `reference.md` beside it with the action
vocabulary, the `$N` substitution rules, the placeholder types and the full list
of traps. Read it before writing actions. The `CatalogAction` type in the
compiler source is stale and omits several fields the compiler does read, so
working from the source type will mislead you.

Three things from that list are worth knowing before you open the file, because
each one fails quietly rather than loudly.

**A dialect may add verbs, never sentence shapes.** That restriction is why
every dialect reads alike. If what you want will not fit an existing shape, you
are in a core change.

**One typo in a `text:` pattern breaks every feature in the project**, including
ones that never use your dialect. The compiler throws while merging the
catalogue rather than reporting a diagnostic, so you get a stack trace with no
line number. Compile after every verb you add.

**A `baseVersion` that does not match the core is refused silently.** The whole
dialect is dropped with only a console warning, and then every one of its steps
reports `No mapping for step`. If a vocabulary seems to have vanished, look for
that warning first.

## A dialect of your own, without publishing anything

**You do not need an npm package, a repository, or membership of any
organisation.** A dialect is two YAML files in a folder. The compiler has no
idea whether a dialect arrived from npm or from your text editor.

Put it in your asset root beside the dialects you downloaded:

```
my-tests/
  components/
    index.json            <- add your id to the list
    weather/
      component.yml
      steps.yml
  features/
    weather-smoke.feature
```

`index.json` is a plain list and it is **not** optional — a folder missing from
it is invisible to the compiler, and the only symptom is `No mapping for step`
against your feature file:

```json
{ "components": ["fhir-validator", "weather"] }
```

Then compile as usual:

```bash
ITB_ASSET_ROOT=./my-tests npx otb-gherkin compile my-tests/features
```

That is the whole mechanism. `component.yml` declares the id and which steps
file to read; `steps.yml` holds the verbs. Copy the smallest existing dialect and
edit it — `jwt` is a good model, because it has no service of its own.

Mixing yours with downloaded ones is the normal case and is safe:

```bash
npx otb-gherkin dialects --installed --out my-tests   # or --from <url>
```

Re-running that **keeps** a dialect it did not fetch and reports it as
`kept <id>`, so your own work is not unlisted by the next refresh. (It used to
be: `index.json` was rewritten with only what that run fetched, your folder
stayed on disk, and the failure surfaced as `No mapping for step` against the
feature file — pointing at the wrong thing entirely. Fixed, but if you are on
`@opentestbed/otb-gherkin` 0.4.0 or earlier you still have the old behaviour, so
check `index.json` after a refresh.)

### Sharing it without publishing

Any URL that serves the two files works, so your own repository is enough — no
`@opentestbed` scope and no org membership:

```bash
npx otb-gherkin dialects --from https://raw.githubusercontent.com/<you>/<repo>/main/dialect --out my-tests
```

In the browser workbench, add the same base URL under **Components → Plugin
dialects**, or pass `?dialects=<url>,<url>` for a session. A remote dialect
overrides a bundled one with the same id, which is what makes a fork testable.

Publishing to npm (below) buys one thing: pinning by your lockfile. It is not a
prerequisite for anything else.

### Two traps that cost the most time

**`kinds:` is a list, not a mapping.** `kinds: [weather-service]`. Written as a
mapping it is valid YAML, so it loads — and then the compiler used to die with
`object is not iterable`, no file and no line. `otb-gherkin dialects` now rejects
the shape by name, and the merge warns and reads the keys, but write it as a
list.

**A dialect whose target is the system under test must use a plain `{actor}`
slot, not `{actor:your-kind}`.** `is the system under test` has no kind slot, so
a kind-qualified slot can never bind to the SUT, and the error you get is
`No system under test among the declared actors`. Actor kinds are for
infrastructure — a validator, a decoder, a peer you stand up. Compare `oauth`
(the authorization server is the SUT: plain `{actor}`) with `jwt` (borrows a
validator: `{actor:fhir-validator}`).

## Verifying a change

If you are working in a **plugin repository** inside the OTB checkout, editing
`dialect/steps.yml` tests nothing on its own: the compiler reads dialects from
the workbench's `app/public/components/`, so sync first.

```bash
node ../itb-cli/src/sync-dialects.mjs          # plugin repos -> workbench
ITB_ASSET_ROOT=./assets npx otb-gherkin compile <a feature that uses it>
npm test --workspace packages/gherkin           # in ../itb-cli: the golden corpus
```

The sync is a destructive whole-folder replace, so edit in the plugin repository
and sync, never the other way round.

If you are working in **your own folder** as above, there is no sync: the file
you edit is the file the compiler reads, and `otb-gherkin compile` is the whole
loop. The golden corpus belongs to the language package and is not something you
need. Write a feature that exercises every verb and keep it next to the dialect —
that is your regression test.

The golden corpus keeps **frozen copies** of the language and the dialects, so
changing a real dialect does not move its snapshots. Add a feature that
exercises your verbs to `../itb-cli/packages/gherkin/test/corpus/features/`,
copy your dialect into that fixture set, and re-record with
`npm run test:update`. Then read the diff line by line before committing it: the
snapshot diff is the entire observable effect of your change, and a re-recorded
snapshot you did not read is a test that now asserts whatever you did, including
the bug.

## Publishing a dialect

**Optional.** Everything above works without it; publishing buys pinning by a
lockfile and a name others can `npm install`. Skip this section unless you want
that.

Each dialect is an npm package whose root *is* the dialect folder, so
`dialect/package.json` sits beside `component.yml`:

```json
{
  "name": "@opentestbed/dialect-<id>",
  "version": "<the dialect's own language.version>",
  "files": ["component.yml", "steps.yml", "steps-v1.yml", "scriptlets"],
  "otbDialect": { "id": "<id>" },
  "peerDependencies": { "@opentestbed/otb-gherkin": ">=0.4.0" }
}
```

`otbDialect.id` is how a resolver recognises the package and learns its id, so a
dialect published under any scope is found. It must equal `component.yml`'s
`id`, because the compiler keys actor kinds, value types and `@dialect:` tags off
that while the folder it installs into is what gets loaded. Nothing checks they
agree except the registry validator.

Set the package version to the dialect's `language.version` so that a
`@dialect:<id>@^2` tag in a feature file and the installed package mean the same
thing rather than being two unrelated numbers.

Then check it before publishing:

```bash
node ../itb-plugins/scripts/registry-validate.mjs ../itb-plugin-<name>
```

That checks both generations of step format, allows a dialect-only plugin with
no runtime, and catches the two identity mistakes above along with unknown
placeholders, non-conforming actor kinds and `kinds`/`verbs`/`steps` written as
mappings instead of lists.

It needs the `itb-plugins` checkout and `js-yaml`. Without them, `otb-gherkin
dialects --from <your folder>` already rejects the mistakes that otherwise fail
silently — a folder name that disagrees with `component.yml`'s `id`, a missing
steps file or scriptlet, a list-shaped key written as a mapping, and a
`baseVersion` the installed core does not satisfy.

## Scriptlets

A scriptlet is raw GITB TDL that a verb calls when the action vocabulary is not
enough. Two live in the language package itself, because the core calls them:
`instructUser.xml` and `serializeJsonObject.xml`. A dialect may call either —
resolution is one flat namespace by path across the core and every enabled
dialect, which is what makes a base scriptlet reusable instead of vendored.

That flat namespace has a consequence. Two sources shipping the same path with
different content collide, and the first one wins. The compiler now warns when
that happens; identical content is ordinary reuse and says nothing. If you need
a generic HTTP or JSON helper, prefer calling a base scriptlet over shipping
your own copy.
