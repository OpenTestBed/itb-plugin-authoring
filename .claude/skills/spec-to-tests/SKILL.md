---
name: spec-to-tests
description: Turn a specification into executable conformance tests — set the scope from its profiles or its actors, agree with the user which kinds of test to write, author them in Gherkin, prove they compile, and run them against a live Interoperability Test Bed. Use when someone brings a spec, an implementation guide, a profile or a capability statement and wants tests for it.
---

# From a specification to running tests

Four stages, in order, each with a gate you cannot skip: **scope, identify,
author, prove**. The last stage has two gates — the tests must compile, and
they must run against a real Interoperability Test Bed. A test that has only
compiled has established nothing.

Work with the user at stages 1 and 2. Those are the decisions that determine
whether the suite is worth anything, and they are not yours to make alone.
Stages 3 and 4 you do.

If you have not run this before, read `references/setup.md` first and confirm
the prerequisites, because stage 4 fails late and confusingly without them.

## Stage 1 — Take the spec and set the scope

Ask for the specification, then read it. Not the website: the package, the
profiles, the capability statements, the examples. What you are looking for is
what the spec says a system must **do** and must **produce**.

Then fix the scope with the user. There are two shapes, and they lead to
different suites:

**Actor-scoped.** The spec names actors, each with its own obligations, often
with a capability statement per actor. One test plan per actor, and the system
under test plays one actor at a time. Choose this when the spec's own structure
is "a Creator must…, a Consumer must…".

**Profile-scoped.** The spec constrains resources and the question is whether
an instance conforms. The suite is about documents or messages rather than
about a system's behaviour. Choose this when the spec is mostly profiles.

Most specs have both. Ask which one the user cares about now, and say what the
other would cover, so the omission is deliberate rather than accidental.

Write the scope down before writing any test: which actor or which profile,
which version of the spec, and what is explicitly out of scope. Everything
after this stage is judged against that sentence.

## Stage 2 — Agree which kinds of test to write

**Ask the user. Do not assume.** Positive tests are the usual starting point
and they are never the whole answer. Offer the catalogue in
`references/test-types.md`, which lists each kind with what it is for and what
it costs, and ask which ones are in scope for this round.

At minimum establish:

- positive paths — always, unless the user says otherwise;
- whether **negative** tests are wanted, meaning the cases a conformant system
  must reject. These are where most real defects surface, and they are the
  most commonly skipped;
- whether anything must be **attested by an operator** rather than asserted,
  such as something the system displays. If the spec has requirements about
  presentation, no request will settle them.

Then produce a list of proposed test cases, one line each, grouped by kind,
and get the user to confirm it before you write a single step. A list is cheap
to change; a suite is not.

Each proposed case names the requirement it covers. A case that cannot name
one is a case nobody will dare delete later — either find the requirement or
drop the case.

## Stage 3 — Author them in Gherkin

Write the feature files. `references/authoring.md` has the conventions, the
sentence shapes and the traps. The short version:

- one system under test per scenario, everything else infrastructure;
- one scenario, one claim, named for the claim rather than the mechanics;
- declare the language and dialects in the tags;
- bind every value you produce with `as $x`, and never rely on a value some
  earlier step happened to leave behind;
- check the file is not generated before editing it.

Keep the test cases in the order the user confirmed, and keep the requirement
reference on each one.

## Stage 4 — Prove it

### Gate 1: it compiles

```
ITB_ASSET_ROOT=<root> node scripts/compile.mjs <features-dir>
```

Exits non-zero on any error and prints every diagnostic, not the first few.
Read the warnings too: an undeclared actor or a dialect that is not enabled
shows up there and is usually the real problem.

Fix everything before going further. Compilation is cheap and the next gate is
not.

### Gate 2: it runs against a real ITB

```
ITB_ASSET_ROOT=<root> node scripts/compile.mjs <features-dir> --out build --zip suite.zip
node scripts/run-on-itb.mjs deploy build/suite.zip
node scripts/run-on-itb.mjs run <testCaseId> ...
```

`run` exits non-zero unless every session ends in SUCCESS, so it is a gate
rather than a report. Two results need care:

- **UNDEFINED** is not a pass. It means no verdict arrived, either because the
  session is still going or because it is waiting for an operator to answer a
  dialog. An unanswered test has established nothing.
- **A failure is a question, not an answer.** Do not report it as a defect in
  the system under test until you have localised it. The
  `diagnose-test-failure` skill is the procedure; its one rule is that you may
  not call something a defect in software you do not own until you have
  reproduced it outside the test bed.

A suite whose negative tests all pass on the first run deserves suspicion.
Check that a must-reject case actually fails when you feed it something valid;
a test that cannot fail is not a test.

## What you hand over

- the feature files;
- the scope sentence from stage 1 and the confirmed case list from stage 2,
  kept beside them in a README, with each case's requirement reference;
- the compile output and the run output, with the date and which build of the
  system under test they were measured against;
- what you did not cover, and why.

That last item is the one people skip and the one reviewers need. A suite that
does not say what it leaves out reads as a claim of completeness it cannot
support.

## Going further

If the user wants the suite published as a FHIR TestPlan and implementation
guide rather than kept as feature files, that is a different and later job;
use the `spec-to-test-ig` skill for it. If a step you need does not exist in
the language, that is a dialect change, not a reason to write the test badly;
see `add-language-dialect`.
