---
name: add-language-dialect
description: Author a new OTB Gherkin dialect — the verbs, actor kinds and value types that let feature files talk to one service (a validator, a decoder, a repository). Use when asked to "add steps for X", "support X in the test language", "write a dialect", or to extend an existing dialect with new verbs.
---

# Adding a language dialect

A dialect is a plugin that teaches the test language one domain. It contributes
**verbs, actor kinds, value types and at most one conformance handler**, and
nothing else. It may not add a sentence shape: the six shapes belong to the core
language and are what make every dialect read alike. If the thing you want
cannot be said in an existing shape, you need a core change, which is a
different and much heavier conversation.

Everything here was checked against the compiler, not the prose docs. Where
`GRAMMAR.md` or `TUTORIAL.md` disagree with this file, they are wrong; see
`reference.md` for the list.

## 0. What you produce

```
itb-plugin-<name>/
  itb-plugin.yaml          name: <id>   +   dialect: { path: dialect/ }
  dialect/
    component.yml          identity, and which core language you target
    steps.yml              kinds, types, conforms, verbs
    scriptlets/*.xml       optional, each listed in component.yml
```

`itb-plugin.yaml`'s `name:` and `component.yml`'s `id:` **must be the same
string**. Nothing checks this. The sync uses the first for the folder name and
the compiler uses the second for kind and type ownership, so if they diverge the
dialect loads but `@dialect:<id>` tags and enablement silently stop working.

## 1. Write the service contract first, even if the service does not exist

The `archimate` plugin is the pattern. Its `component.yml` states the HTTP
endpoints it expects in a comment, the dialect is authored against that, and the
service is built to match afterwards. Doing it in this order forces the
vocabulary to be about the domain rather than about whatever the service happens
to return today.

Write down, for each verb: the endpoint, the request shape, and which part of the
response becomes the value the author binds.

## 2. `component.yml`

Only four things here affect compilation. `id`, `name`, and the `language` block:

```yaml
id: my-thing                 # === itb-plugin.yaml name:
name: My Thing
version: "0.1"               # the build, not the dialect spec
description: >
  One sentence. It appears in the catalogue.

language:
  steps: steps.yml
  version: "1.0.0"           # THIS dialect's spec version
  base: itb-core-en
  baseVersion: ">=2 <3"      # which core language you target — use this value
```

**Omitting the `language` block loads no steps at all** for a locally synced
dialect, with no warning. The only symptom is `No mapping for step` on every
line. (Remote-served dialects default to `steps.yml`; local ones do not. Do not
rely on that asymmetry.)

If `baseVersion` does not match the core's `specVersion`, the **entire dialect is
refused** at merge time with only a `console.warn`, and every one of your verbs
vanishes. Today the core is `itb-core-en` at `2.0.0`.

`docker`, `healthCheck`, `actors` and `services` are optional and inert to the
compiler — the workbench uses the first two for a health dot. In particular
`actors:` does **not** declare actor kinds. Kinds come from `steps.yml`.

## 3. `steps.yml`

```yaml
id: my-thing
name: My Thing Steps
description: >
  One sentence.

kinds: [my-thing-service]          # lower-kebab only: [a-z][a-z0-9-]*

types:
  mything:Doc:                     # free-form key
    name: My document              # what an author types in `$x is a My document`
    path:                          # optional: how to read `$x at "..."`
      kind: my-thing-service
      actions: [ ... ]             # $subject, $path -> $pathVar

conforms:                          # optional, at most one per dialect
  kind: my-thing-service
  actions: [ ... ]                 # $subject, $profile, $ignore -> conformanceErrors

verbs:
  - text: '{actor} does the thing to {ref}( on {actor:my-thing-service})? as {var}'
    doc: One line for the catalogue.
    output: { type: 'mything:Doc' }
    actions:
      - ...
```

Four things to get right here:

**A kind must match `[a-z][a-z0-9-]*`.** A capital letter or an underscore makes
the kind unwritable, because the core's `is a/an {kind}` sentence will not match
it. Nothing validates this; you find out when no one can declare your actor.

**`output: { type: ... }` is what makes paths work.** It binds the type to the
verb's last `{var}`. Without it the author must write `$x is a My document` by
hand before any `at "path"` assertion.

**The conformance contract is one variable.** Your `conforms` handler must leave
the number of errors that count in a variable named `conformanceErrors`. The
core asserts it; that is the whole contract. Also publish `validationErrors`,
`validationWarnings`, `validationOutcome` and `validationSeverity`, because the
core's `$validation.*` references map onto those exact names.

**A verb with no `text:` is silently skipped.** A typo in the key (`txet:`)
produces no verb and no error.

For the action vocabulary, the `$N` substitution rules and the full list of
traps, read `reference.md` in this directory. Do not write actions from memory:
the `CatalogAction` type in the source is stale and omits several fields that
the compiler does read.

## 4. The rules that will actually bite you

1. **No backslashes, anywhere in any expression.** ITB has no escape character
   (TDL-042). Pick the quote the text does not use; if it needs both, splice with
   `concat(..., "'", ...)`. The compiler lints this and fails the build.
2. **`when:` and `unless:` guard an action**, on whether the guard
   substitutes to something or to nothing. Use them to branch on an optional
   slot. `unless:` was documented but unimplemented until 0.3.5, so an action
   carrying it always ran; on an older compiler, invert the condition and use
   `when:`.
3. **Any `assign` of a response body that will feed a template or a JSON body
   needs `type: 'string'`.** A messaging handler returns bytes when it does not
   recognise the content type, and FreeMarker then dies on a byte sequence.
4. **One typo in `text:` breaks every feature in the project**, including ones
   that never use your dialect. `compileStepText` throws rather than reporting a
   diagnostic, and the throw happens while merging the catalogue. You get a stack
   trace, not a line number. Compile after every verb you add.
5. **All TDL variables share one flat namespace per test case.** Prefix
   everything you invent with your dialect (`mythingHeaders`, not `headers`).
   Never use `i`, `row`, `tableRows`, `docString`, or any `$validation*` /
   `conformanceErrors` / `lastRequest` name for your own purposes.
6. **Core wins, and first dialect wins.** You cannot override a core sentence,
   and a duplicate actor kind or value type is dropped with a console warning
   you will not see.

## 5. Verify

In order. Each one catches something the previous one does not.

```
node src/sync-dialects.mjs                                    # from itb-cli
node packages/gherkin/scripts/check-features.mjs <asset-root> <features-dir>
npm test --workspace packages/gherkin                         # the golden corpus
```

Editing `dialect/steps.yml` in the plugin repo **tests nothing on its own**. It
must be synced into the workbench's `public/components/` first, because that is
the asset root the compiler reads. The sync is a destructive whole-folder
replace, so any hand edit under `public/components/` is lost.

Write at least one feature file that exercises every verb and keep it with the
plugin. Add it to the golden corpus at
`itb-cli/packages/gherkin/test/corpus/features/` and record the snapshot with
`node test/corpus.mjs --update`, then read the diff before committing it. The
corpus holds **frozen copies** of the dialects, so a new dialect needs its
fixture added; without that, nothing anywhere tests your verbs.

## 6. Ship

- Sync, which also rewrites `public/components/index.json`. A folder that is not
  in that file is invisible to the compiler.
- Mirror to the ITB manager. `sync-dialects.mjs` does this for
  `../itb-manager` or whatever `ITB_DIALECT_MIRRORS` names. A dialect missing
  from a mirror fails as `No mapping for step` in that app alone, which is a
  miserable way to find out.
- Add the plugin to `itb-plugins/index.yaml` with `dialect: true`. Check the
  capabilities it declares in `requires:` actually exist under
  `itb-plugins/capabilities/`; several referenced today do not.
- Regenerate the language catalogue docs so the new verbs are findable:
  `npm run gen:language-docs` in `itb-plugin-authoring/app`.
