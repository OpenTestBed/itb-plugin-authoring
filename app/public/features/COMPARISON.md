# One test case, three forms

Where the MHD features came from, and what they replace.

Upstream is Gazelle's MHD simulator —
[`gazelle/public/simulation/mhd-fhir-simulators`](https://gitlab.inria.fr/gazelle/public/simulation/mhd-fhir-simulators)
— a Quarkus service that plays the peer actor and holds its test cases as
Java classes inside itself.

Measured from a clone, for **one** test case (`ErrorScenario1`, the thirteen
CH:MHD-1 rejection cases):

| | Gazelle | GITB TDL | Gherkin |
|---|---|---|---|
| the steps | `ErrorScenario1.java`, 81 lines | 13 testcase XML, 1,123 lines | 13 scenarios, 143 lines |
| the payloads | 13 JSON files, 1,729 lines | inlined, XML-escaped | **fetched from upstream** |
| the description | 34 kB HTML with an inlined SVG | a `desc` attribute | the scenario names |
| the vocabulary | `StepConfiguration`, `CreateResource`, `RequestType` — **in another repo** | — | the dialect, versioned by `@lang:` |
| who writes it | a Java developer | nobody — generated | a domain expert |
| **what it is** | **code** — compile, build and host it first | **data** — upload and share as it stands | **data**, and small enough to read |
| total | **1,810 lines · 15 files** | **1,264 lines · 18 files** | **143 lines · 1 file** |

## The same step, three ways

**Gazelle** — `ErrorScenario1.java`. The element under test appears only inside
a filename; the expectation is the bare literal `true`, and the class that gives
it meaning is not in the repository:

```java
new UpdateResource(
    fileUtil.getResourceFileAsString("updates/KO-ErrorCase3-4-hashModified.json"),
    RequestFormat.JSON,
    new StepConfiguration(true, ResourceType.DOCUMENT_REFERENCE, RequestType.UPDATE, 1)),
```

**GITB TDL** — generated, never hand-written. Declarative and self-contained,
and it *does* state the expectation — but 83 lines for this one case:

```xml
<send id="lastRequest" desc="PUT /DocumentReference/…" handler="HttpMessagingV2"
      from="DocumentSource" to="DocumentResponder">
  <input name="body">'{ &quot;hash&quot;: &quot;AAAA…=&quot; }'</input>
</send>
<verify handler="NumberValidator" desc="Response status is 400">
```

**Gherkin** — [`mhd-immutable-metadata.feature`](mhd-immutable-metadata.feature):

```gherkin
# upstream fixture: updates/KO-ErrorCase3-4-hashModified.json
Scenario: mhd-imm-006 update changing hash is rejected
  When DocumentSource gets "https://gitlab.inria.fr/…/KO-ErrorCase3-4-hashModified.json" as "payload"
  When DocumentSource puts to DocumentResponder at "/DocumentReference/" with id "docId" and body "payload"
  Then "response status" should be "400"
```

## Two problems, two layers

**Distribution.** A test case that is *code* must be compiled, built and hosted
before anyone can run it. A test case that is *data* is handed over, uploaded and
versioned as it stands. **That is what ITB changes**, along with the plugin model
that lets systems contribute their own validators, handlers and services.

**Maintenance.** But data is not automatically comprehensible: 1,264 lines of XML
are no easier to read, diff or review than 1,810 lines of Java. On that problem
the two machine-facing forms are in the same position. **That is what the
readable layer changes**, and it sits on top of the runtime rather than replacing
it.

Underneath both: **which discipline owns the test.** Changing a Gazelle assertion
means being a software engineer. The person who knows CH:MHD-1 and the person who
can change the test are usually not the same person. The third column is the only
one where those concerns come apart.

## Coverage

| upstream | here |
|---|---|
| `ClientNominalScenario1` | `mhd-nominal-update.feature` — `mhd-nom-001`, incl. the idempotent re-send |
| `ClientNominalScenario2` | `mhd-nominal-update.feature` — `mhd-nom-002`, cross-community |
| `ClientErrorScenario1` | `mhd-immutable-metadata.feature` — all 13 |
| `ServerNominalScenario1` | `mhd-document-source.feature` — the SUT initiates; needs `btxn`/`etxn` |
| — | `mhd-stateful-peer.feature` — a real FHIR server as the peer |

The payloads are **fetched from the source repository**, not copied, so these
tests send the same bytes the reference implementation sends and cannot drift
from it. All 14 fixtures were confirmed reachable.

## Building a peer is development; writing a test is not

Three of the four scenarios need no purpose-built service. FHIR already supplies
most of a peer declaratively — a conformant server plus uploaded
StructureDefinitions, ValueSets, CapabilityStatements and test data. That is
configuration, and `mhd-stateful-peer.feature` verifies the pattern against a
live server: create returns `201` with a server-assigned id, and reading it back
returns the resource intact.

Only `mhd-document-source.feature` needs a peer that **behaves** rather than
**holds state** — and that is a messaging transaction, not a service:

```gherkin
Given DocumentResponder is listening for DocumentSource
When DocumentResponder receives a request from DocumentSource within "300" seconds
Then "lastReceived{method}" should be "PUT"
And DocumentResponder replies to DocumentSource with status "200" and: …
```

## What is not established

- **None of these has run against a live MHD Responder.** Endpoints are
  placeholders and the IUA flow expects a real authorization server. This
  compares the test-case artefact, not two systems' behaviour at run time.
- **No ITB instance has executed a `btxn`.** The emitted XML carries every
  attribute `gitb_tdl.xsd` marks required, but whether `HttpMessagingV2` holds
  the connection open for a correlated reply is untested.
- **Gazelle's payloads are complete CH:MHD-1 fixtures**, and these tests now use
  those same files — but the surrounding Java also runs Maestro, Matchbox and an
  HTTP validator, which these features do not reproduce.
