---
description: Work out why a test failed before calling it a defect.
argument-hint: <test case id, or paste the failure>
---

A test has failed: **$ARGUMENTS**

Follow the `diagnose-test-failure` skill. Its one rule governs everything else:
**you may not call something a defect in software you do not own until you have
reproduced it outside the test bed.**

Localise the fault first — the system under test, the test, the comparison, or
the environment. In particular, `UNDEFINED` is not a failure and not a pass: it
means no verdict arrived, usually because the session is still running or is
waiting for an operator to answer a dialog.

Report what you established and what you only suspect, and keep them apart.
