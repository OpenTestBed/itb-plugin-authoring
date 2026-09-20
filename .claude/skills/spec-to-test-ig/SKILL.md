---
name: spec-to-test-ig
description: Derive conformance test cases from a FHIR implementation guide's actors and element obligations, self-test them against the IG's examples, and publish them as a TestPlan + Gherkin IG package (the pharm-MEOW-test layout). Use when asked to "add test cases for the actors of <IG>", to cover obligations, or to build a test IG package for a specification.
---

# From a specification to a test IG

The procedure that produced `ips-creator.feature`, `ips-consumer.feature`,
`ips-server.feature` and the `hl7-ips-test` IG. Follow it in order and keep the
record (step 7) as you go; the record is part of the deliverable.

## 0. What you produce

| Deliverable | Where |
|---|---|
| Obligation inventory | `app/public/data/<spec>-obligations.json` |
| Feature files, one per actor | `app/public/features/<spec>-<actor>.feature` |
| Coverage matrix (obligation → test) | `app/public/data/<spec>-obligation-coverage.json` |
| Process record | `app/public/features/<SPEC>-TESTS.md` |
| The IG package | `<ImplementationGuides>/<spec>-test/` with `dist/package.tgz` |

## 1. Check the specification

Download the published package (`<site>/package.tgz`) and read, from the
package rather than the HTML: `package.json` (id, version, FHIR version), the
`Basic-*.json` / `ActorDefinition-*.json` actors, the `CapabilityStatement-*`
each actor points at, and the `example/` documents. Note which example is the
richest (the reference dataset) and which show missing information.

## 2. Check the actors

For each actor record: id, canonical, description, `derivedFrom` (a derived
actor inherits every obligation of its base and adds a transport, e.g. the IPS
Server adds `$summary` to the Creator), and the CapabilityStatement if any.

## 3. See the obligations

```
node app/scripts/ips-obligations.mjs extract --spec <id>#<version> --url <site>
```

reads every `obligation` extension on every profile's snapshot elements into
(profile, element, code, actor). The extractor is generic; if the spec has no
obligation extensions, stop here and derive the list from `mustSupport` plus
the narrative instead, recording each derived obligation with its source.

## 4. Define the test cases

One feature per actor. One scenario per profile that carries obligations for
that actor, plus document-level scenarios and the missing-information cases.
Each obligation code has one test pattern:

| Obligation | Pattern |
|---|---|
| `SHALL:populate` | `all(<element>.exists())` on every instance the SUT produced |
| `SHALL:populate-if-known` | present wherever the reference dataset has it: `all(...)` when every reference instance has it, `where(...).exists()` when some do, tester attestation when none does |
| `SHALL/SHOULD:able-to-populate` | present in the produced document, else attested |
| `MAY:able-to-populate` | `log`, no assertion |
| `SHALL:handle` | the Consumer accepts a document carrying the element without error (yes/no per profile) |
| `SHOULD:display` | the tester names the elements NOT displayed; one assertion per element |

Rules that keep the tests meaningful:

- The reference dataset is the spec's own richest example: the Creator's system
  is loaded with it, the Consumer is handed it. That is what makes
  `populate-if-known` testable.
- Every scenario carries `@profile:<id>` and `@covers:<element>` tags and
  mentions every covered element in a step (an assertion path, or the prompt
  text). `check` fails otherwise.
- A derived actor gets a feature for its transport only; its inherited
  obligations are the base actor's feature run on the transport's output.
- Prefer the generator (`generate`) over hand-writing; hand-write only the
  transport features (Server) and adjust the SPEC-SPECIFIC block of the
  generator (required sections, value-set discriminators).

## 5. Create and test them

```
node app/scripts/ips-obligations.mjs all --spec <id>#<version> --url <site> --reference <example>
node ../itb-cli/packages/gherkin/scripts/check-features.mjs app/public app/public/features/<spec>-creator.feature
java -jar validator_cli.jar <reference example> -version 4.0.1 -ig <id>#<version>
```

`all` = extract → generate → **selftest** (every generated assertion is
evaluated with fhirpath.js against the spec's own examples; a form that does
not hold is downgraded or turned into an attestation, so what is written holds
on the reference) → **check** (every obligation covered and mentioned). Then
compile each feature to TDL with `check-features.mjs`, and validate the
reference example with the HL7 validator so the dataset itself is known good.
Run a scenario end to end on the ITB only when a system under test exists.

## 6. Package as an IG

```
node app/scripts/build-test-ig.mjs app/public/data/<spec>-test-ig.json --package
```

The config names the IG, the spec, its actors (scope canonical, feature file)
and the process page. The builder writes `sushi-config.yaml`, one TestPlan
FSH per actor (suite per `Rule:`, test per `Scenario:`, assertion per `Then`
step, covered obligations in each test's description), the Binaries that
render the Gherkin, the pages, and the vendored scaffold
(`app/scripts/test-ig-scaffold/`: `_package.py`, template, CI). `--package`
runs SUSHI and produces `dist/package.tgz`. Commit the IG folder as its own
repository.

## 7. Keep the record

Write `app/public/features/<SPEC>-TESTS.md` as you go: what was checked (spec
version, actors, counts), the decisions (reference dataset, patterns, what is
attested rather than asserted), the test results (selftest, check, compile,
validator), and how to rerun. It becomes the IG's "Method" page.

## Where obligation logic belongs

Rendering and structural checking of obligation extensions is the IG
Publisher's job (it does both). Checking an *instance* against `populate`
obligations for a named actor is a validator concern and the HL7 validator /
HAPI core does not offer it from the CLI today (no actor option). Behavioural
obligations (`handle`, `display`, `able-to-populate`) can only be tested by a
harness with a reference dataset and a tester, which is what these features
are. See the IPS record for the full argument.
