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

## Verifying a change

Editing a dialect in its plugin repository tests nothing on its own. The
compiler reads dialects from the workbench's `app/public/components/`, so:

```bash
node ../itb-cli/src/sync-dialects.mjs          # plugin repos -> workbench
ITB_ASSET_ROOT=./assets npx otb-gherkin compile <a feature that uses it>
npm test --workspace packages/gherkin           # in ../itb-cli: the golden corpus
```

The sync is a destructive whole-folder replace, so edit in the plugin repository
and sync, never the other way round.

The golden corpus keeps **frozen copies** of the language and the dialects, so
changing a real dialect does not move its snapshots. Add a feature that
exercises your verbs to `../itb-cli/packages/gherkin/test/corpus/features/`,
copy your dialect into that fixture set, and re-record with
`npm run test:update`. Then read the diff line by line before committing it: the
snapshot diff is the entire observable effect of your change, and a re-recorded
snapshot you did not read is a test that now asserts whatever you did, including
the bug.

## Publishing a dialect

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
placeholders and non-conforming actor kinds.

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
