---
name: change-core-language
description: Change the core OTB Gherkin language itself — a new comparator, sentence shape, placeholder type or well-known reference in lang/en.yml. Use only when a dialect genuinely cannot express something; adding verbs, actor kinds or value types is a dialect change, not this.
---

# Changing the core language

Read `GOVERNANCE.md` in the language package first; it holds the policy, the
review rules and the style rules a reviewer applies. This skill is the
operational half: where things are, what to run, and what goes wrong.

## 0. Establish that it really is a core change

A new verb, actor kind or value type belongs in a dialect and needs no core
change at all. Use the `add-language-dialect` skill instead. The core is only
for:

- a new comparator or sentence shape,
- a new placeholder type,
- a new well-known reference (`$response.*` and friends),
- a change to how an existing sentence compiles.

A dialect cannot add a well-known reference or a path evaluator even though the
YAML appears to accept them; the merge silently ignores both. That is a real
reason to come here, and the one most likely to be mistaken for a dialect
change.

Write the sentence as an author would type it, before writing any YAML. If it
does not read like the existing ones, the problem is the design, not the
implementation.

## 1. Know what you are about to break

The core is loaded by every feature in every project. Three properties make
this riskier than a dialect change:

- **First match wins and core wins.** A new entry can shadow an existing one,
  including a dialect's. Check what your `text:` could also match.
- **A malformed `text:` throws rather than reporting.** An unknown placeholder
  or an unbalanced brace raises an exception while the catalogue merges, so
  every feature in the project fails to compile with a stack trace instead of a
  diagnostic. Compile after each edit.
- **Generation 1 is frozen.** `lang/en-1.yml` is spec version 1.7.0 and must
  not gain features. If your change has a generation-1 equivalent, it belongs
  in the converter script, not in the frozen file.

## 2. Make the change

Files, all in the language package:

| | |
|---|---|
| `lang/en.yml` | the language. Sentences live under `verbs:`, each with `text:`, `doc:` and `actions:` |
| `lang/en-1.yml` | frozen. Do not add to it |
| `src/parser/stepText.ts` | placeholder types and how `text:` compiles to a regex |
| `src/parser/gherkinParser.ts` | matching, dispatch, slot substitution, the action dispatcher |
| `src/parser/xmlGenerator.ts` | the TDL emitted, the lint rules |
| `scripts/convert-v1-to-v2.mjs` | gains a rule for every deprecation |

`reference.md` in the `add-language-dialect` skill documents the action
vocabulary and the `$N` substitution rules; they are the same here.

Bump `specVersion` in `lang/en.yml`: minor for an addition, major for a changed
or removed pattern. Nothing enforces this, and a silently drifting spec version
is how a feature file's `@lang:` tag stops meaning anything.

**Do not document something you have not implemented.** The `unless:` guard
was promised in two documents and implemented nowhere for several releases.
Two call sites relied on it, so both always ran: the core's file-upload verb
asked the operator for the same file twice. It was fixed in 0.3.5, but only
after the documentation had been wrong long enough to be believed.

## 3. Prove it

In order.

```
npm run build --workspace packages/gherkin
npm test --workspace packages/gherkin          # the golden corpus
```

The corpus compiles 31 fixture features and compares the emitted TDL **byte for
byte** against recorded snapshots. It keeps frozen copies of the language and
the dialects, so any snapshot movement is a compiler change and nothing else.

Add a fixture that uses your new sentence, then re-record:

```
npm run test:update --workspace packages/gherkin
```

**Read the snapshot diff line by line before committing it.** That diff is the
entire observable effect of your change. A snapshot you re-recorded without
reading is a test that now asserts whatever you did, including the bug.

If snapshots moved in files you did not expect to touch, stop. You have changed
how an existing sentence compiles, which is a major bump and a different
conversation.

Then check it against real feature files, which the corpus does not cover:

```
node scripts/check-features.mjs <asset-root> <features-dir>
```

## 4. Publish

- Bump the package version and note the change in its changelog.
- Regenerate the language catalogue so the new sentence is findable:
  `npm run gen:language-docs` in `itb-plugin-authoring/app`. A sentence that
  exists in `en.yml` but in no document is a sentence nobody will use.
- If you deprecated something, add the rewrite rule to
  `scripts/convert-v1-to-v2.mjs` and keep the old entry for one minor release
  with `doc: DEPRECATED — use …`.
- Update `GRAMMAR.md` and `TUTORIAL.md` if the change touches what they
  describe, and check they do not now promise anything else the compiler does
  not do.
