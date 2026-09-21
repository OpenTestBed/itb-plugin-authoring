# HL7 FHIR terminology-ecosystem tests, in the ITB Gherkin language

The whole HL7 terminology test set, one feature per upstream suite, one scenario
per test: 38 features, 1182 scenarios (of 1186 upstream; four are bound to a
FHIR 5.0 server and are left out for a 4.0 server).

Upstream: <https://github.com/HL7/fhir-tx-ecosystem-ig/tree/main/tests>,
`test-cases.json`, pinned at commit `5bf53a4a` (2026-09-19).

Generated — do not edit these files. Regenerate with:

```
node scripts/tx-tests.mjs --source <checkout>/tests [--server URL] [--validator URL] [--material URL] [--fhir-version 4.0|5.0]
```

## What a test looks like

```gherkin
  Background:
    Given TxServer is the system under test at "https://…/tx/r4"
    And FHIRValidator is a fhir-validator at "http://fhir-validator:8080"
    And Client is infrastructure
    And Client fetches the test material from "https://raw.githubusercontent.com/HL7/fhir-tx-ecosystem-ig/<commit>/tests/"
    And TxServer is given the resources:
      | resource                      |
      | simple/codesystem-simple.json |
      | simple/valueset-all.json      |

  Rule: ValueSet $expand

    # Expansion containing all the code system
    @operation:expand
    Scenario: simple-expand-all
      When Client expands on TxServer with:
        """
        { "resourceType": "Parameters", "parameter": [
            { "name": "url", "valueUri": "http://hl7.org/fhir/test/ValueSet/simple-all" },
            { "name": "excludeNested", "valueBoolean": true },
            { "name": "uuid", "valueUuid": "urn:uuid:8acdbfdc-e9d2-11ed-a05b-0242ac120003" } ] }
        """
      Then $response.status should be 200
      And $response should match the pattern in "simple/simple-expand-all-response-valueSet.json"
```

The request is the upstream Parameters with the runner's profile parameters
merged in (the default `uuid`, or the `version/parameters-*.json` profile the
test names, plus `lenient-display-validation` where the test sets it), so the
reader sees exactly what the server receives. The resources a suite depends on
travel with every request as `tx-resource` parameters, as the HL7 runner sends
them. The pattern is the upstream expected-response file, which is already a matchetype;
it is fetched at run time and compared by the FHIR validator.

Upstream modifiers and where they went:

| upstream | here |
|---|---|
| `http-code: 4xx` | `Then $response.status should match "^4"` and tag `@http-code:4xx` |
| `Accept-Language`, `header` | `Given set header "…" to "…"` before the operation |
| `profile`, `lenient-display` | merged into the request Parameters |
| suite/test `mode` | tags `@mode:…`; a sentence in the feature description |
| `version` (4.0, 5.0, !4.0) | generator filter `--fhir-version`; the left-out tests are listed in the file header |
| `response:flat`, `response:tx.fhir.org`, `response2` | `should match one of the patterns in:` with a table of `pattern` rows; one match is enough (24 tests) |
| `full-set` | tag only (the runner's handling was not found) |

## Dialect

`components/fhir-terminology/steps.yml`: kind `terminology-server` and 14 verbs,
no change to the core language. Operations: expands, validates a code, validates
a code against the code system, looks up a code, tests subsumption, translates,
compares value sets, validates a batch, reads the capability statement, reads
the terminology capabilities; plus `fetches the test material from`, `is given
the resources:`, `should match the pattern in` and `should match one of the
patterns in:`. The last two name a file of the test material rather than an
inline doc string, because the upstream expected-response files are already
matchetypes; the comparison is the core `should match pattern:` one. Several
patterns are each compared and one `verify` judges the accumulated verdict.

Endpoints, taken from the HL7 runner and its terminology client: `ValueSet/$expand`,
`ValueSet/$validate-code`, `CodeSystem/$validate-code`, `CodeSystem/$lookup`,
`CodeSystem/$subsumes`, `ConceptMap/$translate`, `ValueSet/$compare`,
`ValueSet/$batch-validate-code`, `GET /metadata`, `GET /metadata?mode=terminology`.

## Verified

- All 38 features compile clean (`check-features.mjs`); three are in the
  compiler's golden corpus.
- The composed request is what the TDL sends: replayed the simple-cases
  expand/lookup/subsumes tests and `/metadata` against
  `https://178.104.103.200.sslip.io/tx/r4` (FHIRsmith 0.13.2, FHIR 4.0.1) with the
  same body composition — status 200 on all, one comparison SUCCESS
  (`simple-subsumes-parent`).
- The matchetype service (`/itb/matchetype/validate` of the validator build in
  the `fhir-validator` container) was probed with controlled inputs:
  placeholders `$id$ $uuid$ $instant$` and `$choice:a|b$` work; **arrays are
  compared in order; `$optional-properties$` is ignored (a listed element that
  is absent fails) and `$optional$` on an array item is ignored (a missing
  optional item fails the item count)**.

## How a response is judged

The comparison goes through the validator's matchetype service with `normalize=tx`, which
applies the same normalisation the terminology test runner does: server detail removed,
and parameters, parts, expansion contents, designations and issues sorted. Without it the
comparison fails on array order alone, because the expectation files are stored in the
order those sorters produce.

The capability-statement tests ask for `mode=partial` instead, through the step
`should contain the pattern in`, because their expected files state a minimum rather than
a whole document. That is how the runner compares them too.

Two gaps remain in the service, measured on the 2026-09-21 build:

- `ValueSet.expansion.parameter` is sorted by the normalisation although the stored files
  are not in that order, so expansion tests still fail. An expectation file compared with
  itself passes without `normalize=tx` and fails with it.
- What a file marks optional must still be present, both an `$optional$` array item and a
  property listed in `$optional-properties$`.

Measured on the `simple-cases` suite against a conformant server: the validator's own runner
passes every test in it; the same comparisons through the service pass 16 of 37. The 21
failures are all expansions and both lookups, and none of them is the server.

## Running in ITB

- Each feature compiles to one test suite (upload from the workbench). The
  system under test is the `TxServer` actor; its address is in the Background.
- The ITB engine (`gitb-srv`) must reach the validator (`http://fhir-validator:8080`
  on the same Docker network) and the test material (raw GitHub by default).
- Every test case fetches its suite's setup resources again (up to 23 GETs per
  case, about 12,000 for a full run). Point `--material` at a local copy of the
  `tests/` folder if GitHub rate limits bite.

## What this says about the language

- The dialect adds vocabulary only; the six sentence shapes carried a
  data-driven test set of 1182 cases with no new construct. A scenario is three
  lines plus its request.
- Naming the server on every verb (`on TxServer`) is forced by "is the system
  under test" carrying no kind. A core option `… is the system under test as a
  terminology-server at …` would let a suite say `Client expands with:`.
- Alternative expected responses (`response2`, `response:flat`) needed a
  sentence of their own; a table verb covers it without a core change. The
  verdict is accumulated row by row because table rows are unrolled at compile
  time, so the final expression cannot name N variables.
- Reader cost that remains: the uuid/profile parameters in every request are
  noise for a human but are what the server receives, and the expected file is a
  name, not content — which is right for 1182 files but means the feature does
  not show what "correct" looks like without opening the file.
