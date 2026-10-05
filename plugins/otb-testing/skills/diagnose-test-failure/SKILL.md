---
name: diagnose-test-failure
description: Work out why a test case failed — whether the fault is in the system under test, the test, the comparison, or the environment — before telling anyone it is a defect. Use when a suite goes red, when asked "why is this failing", when a report needs interpreting, or before opening an issue against someone else's software.
---

# Diagnosing a failing test

A failing test is a question, not an answer. The expensive mistakes in this
project have never been compile errors; they have all been confident wrong
readings of a red result. This procedure exists to slow that down.

**The rule that matters most: you may not call something a defect in software
you do not own until you have reproduced it outside the test bed.** Until then
the honest statement is "this test fails and I have not yet localised it".

## 1. Establish what actually ran

Before looking at the diff, pin down all four. A mismatch in any one of them
produces failures that look exactly like product defects.

| | How to check |
|---|---|
| Which build of the system under test | ask it; a capability statement, a version endpoint, an image digest |
| Which build of the validator or comparison service | its own version endpoint, not the tag you think you deployed |
| Which test material | a branch moves. A published package does not. Know which one the run used |
| Which suite actually ran | the deployed suite, not the file you just edited |

The last one bites constantly here. A feature file on disk is not what ITB
runs; the deployed test suite is. If you changed a file and the result did not
change, check that it was rebuilt and redeployed before concluding anything.

## 2. Rule out the environment before the product

In order, cheapest first. Each of these has produced a full red suite here.

1. **Version skew between the expectation files and the endpoint.** Expectation
   files are shaped for one version of the spec. Pointed at an endpoint of a
   different version they demand elements that endpoint cannot produce, and
   every failure looks like a product bug. The terminology suite scored 26 of
   37 against an R4 endpoint and 37 of 37 against R5 — same server, same build,
   same tests.
2. **The comparison service running on the wrong model.** A validator started
   on the wrong FHIR version silently drops elements it does not know from the
   expected pattern, so a response missing them **passes**. A false pass is
   worse than a false failure, and it hides.
3. **Suites that do not apply.** A suite gated on content the system does not
   claim to hold is not a failure. In the terminology set that is 325 of 1178
   tests. Judge a system on what it claims.
4. **Stale deployment.** Redeploy and rerun before reading a diff twice.

## 3. Localise: is it the test, the comparison, or the product?

Get a second opinion from a different execution path. Most suites here have
one, and it is the single most useful move available.

```
java -jar validator_cli.jar txTests -tx <server url> -output <folder>
```

The terminology tests have their own upstream runner. When the runner passes a
test that this test bed fails, the fault is in the comparison path, not in the
server, and you have just saved yourself from filing a wrong bug. Measured on a
real server: the upstream runner failed 3 of 664 general-mode tests while the
same tests through the dialect passed 524 of 671. That gap was the comparison,
and reading it as 147 server defects would have been badly wrong.

If no second path exists, reduce instead. Take one failing case, run the
request by hand against the service, and compare the raw response to the raw
expectation yourself. If they agree and the test still fails, the fault is in
the comparison or the normalisation, not in the product.

## 4. Read the diff honestly

Two comparison engines can disagree about the same pair of documents, and
which one you are using changes what a difference means. Before treating a
reported difference as real, check that the comparer actually honours the
markers in the expectation file. A marker the comparer does not implement
reads as a hard mismatch on something the test author explicitly said was
optional.

Cluster the failures before explaining them. A hundred failures with one
message is one cause; ten messages is ten investigations. Count them and lead
with the counts.

## 5. What you may say, and when

- **"This test fails."** Always safe, once you have seen it fail.
- **"This test fails because of X in the comparison path."** After step 3
  localised it, and you can point at the code or the behaviour.
- **"This is a defect in <someone else's software>."** Only with a reproduction
  outside the test bed: a request, a response, and the expected behaviour with
  a citation. Nothing less.
- **"This was fixed."** Only after rerunning against the build that contains
  the fix, and saying which build that was.

When you report, say what you measured, on what date, against which builds.
A number without those is not a finding.

## 6. Retract cleanly

You will sometimes be wrong. When you are, say which claim was wrong and what
you now believe, in one sentence, without rebuilding the argument around the
new facts. Then correct anything you wrote down. A diagnosis that lives on in
a README after being disproved is worse than never having written it.

## Recording what you learn

Environment and comparison findings belong in the suite's README next to the
tests, not in a chat message. Each one should say what was measured, when, and
against which builds, so the next person can tell whether it still holds. The
terminology suite's README is the pattern.
