# IPS test cases — the record

How the test cases for the actors of HL7 International Patient Summary (IPS)
2.0.1 were produced and checked, step by step, so the process can be repeated
for the next IPS release or for another specification. The reusable procedure
is the `spec-to-test-ig` skill; the tooling is `app/scripts/ips-obligations.mjs`
and `app/scripts/build-test-ig.mjs`.

## 1. The specification

| | |
|---|---|
| Package | `hl7.fhir.uv.ips` 2.0.1, FHIR 4.0.1, downloaded from https://hl7.org/fhir/uv/ips/package.tgz |
| Read from | the package, not the HTML: the pages render client-side and could not be fetched reliably |
| Examples used | `Bundle-bundle-ips-all-sections` (42 entries, all 16 sections — the **reference dataset**), `Bundle-bundle-no-info-required-sections` (required sections with `emptyReason`), `Bundle-bundle-minimal` |
| Reference dataset validated | HL7 validator 6.x (`validator_cli.jar`), `-ig hl7.fhir.uv.ips#2.0.1`: 0 errors, 0 warnings |

## 2. The actors

Three `ActorDefinition`s (carried as `Basic` resources in the R4 package):

| Actor | Canonical | Role | Tested by |
|---|---|---|---|
| Creator | `http://hl7.org/fhir/uv/ips/ActorDefinition/Creator` | produces / assembles an IPS document | `ips-creator.feature` (generated) |
| Consumer | `http://hl7.org/fhir/uv/ips/ActorDefinition/Consumer` | receives a document and uses its content | `ips-consumer.feature` (generated) |
| Server | `http://hl7.org/fhir/uv/ips/ActorDefinition/Server`, derived from Creator, capabilities `CapabilityStatement/ips-server` | a FHIR server acting as a Creator through `$summary` | `ips-server.feature` (hand-written: the transport) + the Creator feature on its output |

## 3. The obligations

Extracted from the `obligation` extension on every profile's snapshot elements:

| | |
|---|---|
| Profiles carrying obligations | 29 |
| Element obligations | 676 (Creator 229, Consumer 447; none on Server, which inherits the Creator's) |
| Codes used | `SHALL:populate`, `SHALL:populate-if-known`, `SHOULD:populate-if-known`, `SHALL:able-to-populate`, `SHOULD:able-to-populate`, `MAY:able-to-populate`, `SHALL:handle`, `SHOULD:display` |

The inventory is `app/public/data/ips-obligations.json`; the coverage matrix
`app/public/data/ips-obligation-coverage.json`.

## 4. The test cases that are needed

One test pattern per obligation code, applied to every element:

| Obligation | Creator test | Consumer test |
|---|---|---|
| `SHALL:populate` | the element exists in every produced instance | — |
| `SHALL:populate-if-known` | exists wherever the reference dataset has it | — |
| `SHALL/SHOULD:able-to-populate` | exists in the produced document; attested when the reference data cannot exercise it | — |
| `MAY:able-to-populate` | logged | — |
| `SHALL:handle` | — | the document carrying the element is accepted without error (yes/no per profile) |
| `SHOULD:display` | — | the tester names elements not displayed; one assertion per element |

Decisions taken:

- **Reference dataset.** The Creator's system is loaded with Patricia JORDANA
  (identifier ABC1234) from the all-sections example, so "if known" has a
  definite meaning: known is what the example carries. The Consumer is handed
  the same document. The assertion form (`all`, `where(...).exists()`, or an
  attestation prompt) is decided by evaluating the candidate against the
  example with the FHIRPath engine at generation time.
- **Sections** are selected by their LOINC code (from the profile's pattern),
  not by slice name; entry slices by the target resource type.
- **Observation profiles** are selected by category (laboratory, imaging) or
  by the profile's code pattern / value set (pregnancy, tobacco, alcohol).
- **Data type profiles** (CodeableConcept, Coding) are asserted over
  `descendants()` of every resource in the document.
- **Missing information.** A dedicated Creator scenario exports a patient with
  no known problems, allergies or medications and requires `emptyReason` or a
  "no known" entry in each required section; a Consumer scenario feeds the
  no-information and minimal examples.
- **Every test case asks for the document once.** ITB runs each scenario as an
  independent test case; a Server is tested without pasting.
- **Traceability.** Scenarios carry `@profile:` and `@covers:` tags and must
  mention each covered element in a step. Coverage is checked by script, never
  by eye.

## 5. Results

| Check | Result |
|---|---|
| Features generated | `ips-creator.feature` 31 scenarios, `ips-consumer.feature` 31 scenarios, `ips-server.feature` 6 scenarios |
| Self-test (fhirpath.js 3.18, R4 model) | 150 of 150 generated assertions hold on the reference examples |
| Coverage | 676 of 676 obligations covered by a scenario that names the element; 0 declared-only, 0 uncovered |
| Compile to GITB TDL (`check-features.mjs`) | 0 errors in all three features |
| Reference example vs HL7 validator | 0 errors, 0 warnings |
| Run on a live system | not done — no IPS Creator, Consumer or Server was available |

Two things the tests cannot do, stated rather than hidden: a `populate-if-known`
element that the reference example does not carry is attested by the tester,
not observed; and `SHOULD:display` is judged by a tester, not a machine.

## 6. Packaging

`app/scripts/build-test-ig.mjs app/public/data/ips-test-ig.json --package`
produces the `hl7-ips-test` IG (the pharm-MEOW-test layout): one TestPlan per
actor whose tests are the scenarios and whose assertions are the `Then` steps,
each test's description naming the obligations it covers; the features shipped
under `package/tests/gherkin/`; this record as the Method page.

## 7. Where the obligation logic should live

Three different jobs hide in "handling obligations":

1. **Stating and rendering them** — the IG Publisher's job, and it does it: it
   validates the extension's structure and renders the obligation tables on
   every profile page. Nothing to add.
2. **Checking an instance against them for a named actor** — a validator's job
   in principle: "validate this Bundle as produced by an IPS Creator" could
   turn every `SHALL:populate` into a missing-element error and every
   `populate-if-known` into a warning. The HL7 validator (`validator_cli`,
   HAPI core) has no such option today: its CLI accepts no actor, and
   obligations are ignored at validation time. That is the right place to add
   it, because the profile snapshot already carries the data and the validator
   already walks every element. Until then the generated `$ips at "…"`
   assertions are exactly that check, done outside the validator.
3. **Behavioural obligations** — `handle`, `display`, `able-to-populate`.
   These are about what a system does, not what a document contains, so no
   validator can decide them. They need a reference dataset, a harness, and
   for `display` a human. That is what the ITB features are for, and it is the
   part no publisher or validator change would remove.

So: leave rendering to the publisher, propose actor-scoped validation to the
validator, and keep the behavioural tests in the test IG. The obligation
inventory this record is built from is the same input all three would share.

## How to rerun

```
node app/scripts/ips-obligations.mjs all                        # extract, generate, selftest, check
node ../itb-cli/packages/gherkin/scripts/check-features.mjs app/public app/public/features/ips-creator.feature
node app/scripts/build-test-ig.mjs app/public/data/ips-test-ig.json --package
```

For the next IPS release change the version in the config and the
`--spec` default; for another specification follow the `spec-to-test-ig` skill.
