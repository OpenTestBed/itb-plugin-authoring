# TestPlan IGs cannot move to 6.0.0-snapshot1, and 3.0.0 will not build ballot5

An IG that declares `TestPlan` resources has no buildable FHIR version on IG
Publisher 3.0.0. The two requirements are mutually exclusive:

- **3.0.0 requires `6.0.0-snapshot1`.** It refuses `6.0.0-ballot5` outright.
- **`TestPlan` does not exist at `6.0.0-snapshot1`.** It is not in
  `hl7.fhir.r6.core#6.0.0-snapshot1`, and `hl7.fhir.uv.testing` — the only
  package that defines it — is still published against `6.0.0-ballot5`.

So the IG either declares a version the publisher rejects, or a version at which
its central resource type is undefined.

## The two failures

**ballot5 on 3.0.0** — fails at initialisation, before loading anything:

```
Exception in thread "main" java.lang.Error: Unable to support version
'6.0.0-ballot5' - must be one of 5.0.0, 4.3.0, 4.0.1, 3.0.2 or 6.0.0-snapshot1
	at org.hl7.fhir.igtools.publisher.PublisherIGLoader.initializeFromIg(PublisherIGLoader.java:333)
```

**snapshot1 on 3.0.0** — loads the Testing IG, then fails converting the
instance:

```
Load Package hl7.fhir.uv.testing#0.1.0-snapshot1 (Master)
...
Publishing Content Failed: The resource TestPlan cannot be converted from R5 to R4
	at org.hl7.fhir.convertors.conv50_N.resources50_N.Resource50_N.convertResource(Resource50_N.java:449)
	at org.hl7.fhir.igtools.publisher.PublisherBase.convertToElement(PublisherBase.java:431)
	at org.hl7.fhir.igtools.publisher.PublisherIGLoader.loadResourceContent(PublisherIGLoader.java:4864)
```

The **"to R4"** in that message looks wrong for an IG whose `fhirVersion` is
`6.0.0-snapshot1`, and may be a separate defect — or at least a misleading
message — worth a look independently of the packaging question.

## Which publisher builds what

Measured by building the same IG with each jar, and by reading the
`Enumerations$FHIRVersion` constants out of them.

| Publisher | Released | 6.0.0 codes present | Builds a ballot5 TestPlan IG |
|---|---|---|---|
| 2.2.10 | 2026-06-25 | …`ballot4` | no — does not know `ballot5` |
| **2.3.4** | 2026-09-04 | …`ballot5` | **yes, exit 0** |
| 3.0.0 | 2026-10-08 | …`ballot5`, `snapshot1` | no — `ballot5` not *supported* |

3.0.0's release notes explain the cut: *"Since 2.3.5, the IG publisher has been
based on R6 internally rather than R5"*. That is reasonable; the problem is only
that the Testing IG has not followed.

## Why TestPlan is involved at all

`TestPlan`, `TestScript` and `TestReport` were in R6 core through
`6.0.0-ballot3`, were removed for `ballot5`, and are not in `snapshot1`:

```
hl7.fhir.r6.core#6.0.0-ballot3/package/StructureDefinition-TestPlan.json   exists
hl7.fhir.r6.core#6.0.0-snapshot1/package/                                  2695 files, no TestPlan
```

They now live only in `hl7.fhir.uv.testing`, which makes every `TestPlan`
instance an *additional resource* needing a root-level `resourceDefinition`.
That package's current CI build is:

```
name        hl7.fhir.uv.testing
version     0.1.0-snapshot1
date        20260911132212
fhirVersions ["6.0.0-ballot5"]
dependencies hl7.fhir.r6.core: 6.0.0-ballot5
```

Despite the `0.1.0-snapshot1` label it targets **ballot5**, so it cannot be
consumed by a snapshot1 IG. (`hl7.fhir.uv.testing#dev` is older still —
`ballot3`.)

## What would unblock it

Any one of these, in rough order of preference:

1. **Rebuild `hl7.fhir.uv.testing` against `6.0.0-snapshot1`.** Then IGs move to
   snapshot1 and track `latest` normally. This looks like the real fix.
2. **Return `TestPlan`/`TestScript`/`TestReport` to R6 core**, which would remove
   the additional-resource mechanism from this picture entirely.
3. Keep 3.0.0 able to build `ballot5` until (1) lands.

## Workaround in use

Pin the last publisher that supports ballot5:

```bash
curl -L -o input-cache/publisher.jar \
  https://github.com/HL7/fhir-ig-publisher/releases/download/2.3.4/publisher.jar
./_genonce.sh
```

That builds, renders the TestPlan pages, and keeps `runner`, `suite` and
`suite.input.file` intact. It is a freeze, not a fix: it means not taking
publisher updates.

## Reproducing

A minimal case is any IG with `fhirVersion: 6.0.0-ballot5`,
`dependencies: {hl7.fhir.uv.testing: current}` and one `TestPlan` instance. Two
public examples:

- <https://github.com/costateixeira/pharm-MEOW-test> — built successfully
  2026-09-10 with 2.3.4; fails on 3.0.0.
- An IHE IUA test IG with three TestPlans, 28 test cases — same behaviour on
  each jar above.

## Environment

| | |
|---|---|
| OS / Java | Windows 11, Temurin 17.0.18 |
| SUSHI | 3.20.1 — **succeeds at either version**; only the publisher fails |
| Publisher 3.0.0 | Git# 7d1c5ae624df, built 2026-10-08T04:07:06Z |
| Observed | 2026-10-13 |

Worth stressing the SUSHI line: `fsh-generated/` and `dist/package.tgz` are
produced correctly with `snapshot1`, so the TestPlan resources themselves are
fine. It is only publication that is blocked.
