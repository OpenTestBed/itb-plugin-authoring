Paste-ready for chat.fhir.org. Suggested stream **#IG creation** (the publisher's
own stream); cross-post to **#conformance** or the FHIR-I testing stream if the
Testing IG rebuild is the part that stalls.

Topic: `TestPlan IGs: ballot5 vs 6.0.0-snapshot1 on publisher 3.0.0`

---

An IG that declares `TestPlan` resources has no buildable FHIR version on IG
Publisher 3.0.0, and I'd like to check whether I'm missing something before
filing.

The bind is that the two requirements exclude each other:

- 3.0.0 refuses ballot5 at startup — *"Unable to support version '6.0.0-ballot5'
  - must be one of 5.0.0, 4.3.0, 4.0.1, 3.0.2 or 6.0.0-snapshot1"*
- but `TestPlan` doesn't exist at `6.0.0-snapshot1`. It's not in
  `hl7.fhir.r6.core#6.0.0-snapshot1` (2695 files, no `TestPlan`), and
  `hl7.fhir.uv.testing` — the only package defining it — is still built against
  **ballot5** (current CI build `0.1.0-snapshot1`, dated 2026-09-11,
  `fhirVersions: ["6.0.0-ballot5"]`, depending on `hl7.fhir.r6.core: 6.0.0-ballot5`).

Setting the IG to snapshot1 anyway gets further and then dies converting the
instance:

```
Load Package hl7.fhir.uv.testing#0.1.0-snapshot1 (Master)
Publishing Content Failed: The resource TestPlan cannot be converted from R5 to R4
  at org.hl7.fhir.convertors.conv50_N.resources50_N.Resource50_N.convertResource(Resource50_N.java:449)
  at org.hl7.fhir.igtools.publisher.PublisherIGLoader.loadResourceContent(PublisherIGLoader.java:4864)
```

Two things I'd appreciate a view on:

1. **Is a `hl7.fhir.uv.testing` rebuild against snapshot1 planned?** That looks
   like the actual unblock — then these IGs just track `latest` again. (Or are
   `TestPlan`/`TestScript`/`TestReport` expected back in R6 core? They were in
   core through ballot3 and went out at ballot5, which is what made them
   additional resources in the first place.)
2. **Is "cannot be converted from R5 to R4" the right message here?** The IG's
   `fhirVersion` is `6.0.0-snapshot1`, so the R4 target is surprising and might
   be a separate issue — or at least a misleading diagnostic.

I understand the 3.0.0 cut itself — the release notes say the publisher has been
R6 internally since 2.3.5 — so this is really about the Testing IG lagging
behind rather than about 3.0.0 doing anything wrong.

For anyone hitting the same thing, the workaround is to pin the last publisher
that supports ballot5:

```
curl -L -o input-cache/publisher.jar \
  https://github.com/HL7/fhir-ig-publisher/releases/download/2.3.4/publisher.jar
```

That builds clean (exit 0) and keeps `runner` / `suite` / `suite.input.file`
intact. Measured across three jars on the same IG:

| Publisher | 6.0.0 codes | Builds a ballot5 TestPlan IG |
|---|---|---|
| 2.2.10 | …ballot4 | no |
| 2.3.4 | …ballot5 | **yes** |
| 3.0.0 | …ballot5, snapshot1 | no (ballot5 unsupported) |

SUSHI is happy throughout — `fsh-generated/` and `dist/package.tgz` come out
correct at either version, so the resources are fine and it's only publication
that's blocked.

Repro: <https://github.com/costateixeira/pharm-MEOW-test> built fine on
2026-09-10 with 2.3.4 and fails on 3.0.0; same for an IHE IUA test IG with three
TestPlans. Happy to open a GitHub issue on whichever repo is the right home —
publisher or testing IG.
