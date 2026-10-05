---
description: Publish an existing Gherkin test suite as a FHIR IG with one TestPlan per actor.
argument-hint: <spec id or the features to package>
---

You have been asked to package conformance tests as a FHIR implementation guide
for: **$ARGUMENTS**

Follow the `spec-to-test-ig` skill. The deliverable is a publishable IG, not a
folder of scripts:

- one `TestPlan` per actor, its `scope` naming the system under test;
- one `suite.test` per `Scenario:`, with the requirement comment above the
  scenario becoming that test's `description` — this is the traceability a
  reviewer uses instead of reading Gherkin;
- one `assertion.human` per `Then`/`And` step;
- the `.feature` file attached as a `Binary` so declaration and script cannot
  drift apart;
- the process record as the IG's **Method** page.

The spec does not have to be FHIR. If it publishes no package, set
`spec.dependency: false` in the config and quote its requirements in prose.

State in the IG what it does not claim: it publishes tests and their
traceability, not results. No `TestReport` and no verdicts exist until the suite
has actually run against something.
