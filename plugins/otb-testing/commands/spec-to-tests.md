---
description: Turn a specification into executable conformance tests — scope, case list, Gherkin, compile, run.
argument-hint: <spec URL or package id> [which actor or profile, if you already know]
---

You have been asked to produce conformance tests for: **$ARGUMENTS**

Follow the `spec-to-tests` skill exactly, in order, and do not skip a gate.

Before anything else, confirm the prerequisites in that skill's
`references/setup.md`, because stage 4 fails late and confusingly without them.

The two things that most often go wrong, stated here so they are not a surprise:

1. **Stages 1 and 2 are decisions, not deliverables.** Fix the scope with the
   user, then get the case list confirmed *before* writing a single scenario. A
   list is cheap to change; a suite is not. Each proposed case must name the
   requirement it covers — if it cannot, drop it rather than keep it.

2. **A clean compile is not a passing test.** It means the sentences were
   understood, not that the requests are correct. Read the generated TDL for at
   least the requests your tests depend on, and say plainly in the record that
   gate 2 (running against a real system) is unmet if no system under test
   exists.

If a step you need does not exist in the language, that is a dialect change and
not a reason to write the test badly — use the `add-language-dialect` skill. A
dialect does not need a repository or an npm package: a folder under
`components/<id>/` with `component.yml` and `steps.yml`, plus an entry in
`components/index.json`, is a complete dialect.

When the user wants the result published rather than kept as feature files, the
end state is a FHIR IG carrying one TestPlan per actor — use the
`spec-to-test-ig` skill for that.
