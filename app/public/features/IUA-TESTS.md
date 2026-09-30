# IUA conformance tests — the record

**Status: authored and compiling. Not yet run.** Stages 1–3 of `spec-to-tests`
are done and stage 4 gate 1 is met. Gate 2 is **not** met and cannot be: there
is no IUA implementation to run against. Read section 5 before quoting any of
this as evidence.

## 1. Scope

**Specification.** IHE ITI Internet User Authorization (IUA), Revision 2.5,
Trial Implementation, 18 June 2026.
<https://profiles.ihe.net/ITI/IUA/index.html>

The supplement is published as a single page carrying both volumes; Volume 1 is
the profile and actor/transaction table, Volume 2 the transaction detail. There
is no Volume 3, and no FHIR package — `ihe.iti.iua` is not on the registry — so
there are no profiles, capability statements or examples to work from. Every
requirement below was read from the narrative.

**Shape: actor-scoped.** Three actors, four transactions, four options. One test
plan per actor.

| Actor | Transaction | Optionality |
|---|---|---|
| Authorization Client | Get Access Token [ITI-71] | R |
| | Incorporate Access Token [ITI-72] | R |
| | Get Authorization Server Metadata [ITI-103] | O |
| Authorization Server | Get Access Token [ITI-71] | R |
| | Introspect Token [ITI-102] | O, required with the Token Introspection Option |
| | Get Authorization Server Metadata [ITI-103] | O |
| Resource Server | Incorporate Access Token [ITI-72] | R |
| | Introspect Token [ITI-102] | O, required with the Token Introspection Option |
| | Get Authorization Server Metadata [ITI-103] | O |

**In scope.** All three actors, one plan each. Positive paths, negative
must-reject cases, the shape of OAuth error responses, and security-boundary
cases.

**Out of scope, deliberately.**

- **Option gating as a mechanism.** Cases that depend on a declared option are
  labelled with the option they need, but nothing enforces that a system is
  judged only on options it claims. A system that does not implement the Token
  Introspection Option will simply fail those cases; read the labels.
- **The SAML Token Option.** Untested. The JWT Token Option is covered.
- **Signature verification** on issued tokens. Decoding a JWT is in scope;
  verifying its signature against the Authorization Server's keys is not.
- **Transport security.** IUA inherits ATNA requirements for TLS; those belong
  to ATNA's own tests.

## 2. What the language was missing

Two dialects were built for this suite. Both are additions to the vocabulary,
not workarounds in the tests, and both are usable by any other profile that
delegates authorization.

**`jwt` — decoding a token.** Nine cases inspect JWT claims and no dialect could
do it: `hcert-decoder` handles COSE and CWT, not JWT. GITB TDL has no base64
processor, so the verbs borrow the FHIR validator's FHIRPath endpoint, using
`split()` and `decode('urlbase64')`. Neither function is in the FHIRPath N1
specification nor in FHIR R5's list of added functions — they exist in the HL7
Java implementation. **This rests on an implementation detail rather than on a
standard.** If a validator release drops them these verbs break, and the fix is
a small service of our own. Recorded here because it decides who owns that
break.

**`oauth` — talking to a token endpoint.** This one was not foreseen at stage 2
and was found while authoring. A token endpoint takes
`application/x-www-form-urlencoded`, and the core language cannot send one:

- the core's POST verbs assign `Content-Type: application/json` *inside* the
  verb, so a `set header` written earlier in the scenario is silently
  overwritten;
- a form body has to be assembled from run-time values (an authorization code,
  a PKCE verifier, the resource identifier), and the core's `{value}` slot
  accepts only a literal, a `$variable` or a number — never a `concat()`.

Both are deliberate in the core, which is shaped for JSON APIs, and neither is
something a test author can work around. The first draft of the Authorization
Server plan **compiled clean while sending form bodies labelled as JSON**, which
is worth remembering: a clean compile says the sentences were understood, not
that the requests are correct.

The `oauth` verbs write into the core's own header map, so `set header` and
`set bearer token from` keep working beside them, and client authentication is
still set the ordinary way.

## 3. The test cases as authored

Each case names the requirement it covers. Counts and identifiers match the list
confirmed at stage 2; nothing was added or dropped.

### Plan 1 — Resource Server — [`iua-resource-server.feature`](iua-resource-server.feature)

The system under test holds a protected resource and must police the token. The
profile's testable substance for this actor is what it must **refuse**.

| Case | Claim | Requirement |
|---|---|---|
| RS-01 | A request carrying a valid bearer token returns the protected resource | ITI-72 |
| RS-02 | An expired token is refused with 401 | ITI-72: "shall validate or introspect the access token and ensure that it has not expired" |
| RS-03 | A token whose audience excludes this server is refused with 401 | ITI-72: "shall verify that the audience includes the Resource Server itself" |
| RS-04 | A token whose scope does not cover the request is refused with 401 | ITI-72: "shall verify that the scope covers the transaction to the requested resource" |
| RS-05 | A request with no Authorization header is refused with 401 | ITI-72 |
| RS-06 | A malformed Authorization header is refused with 401 | ITI-72 |
| RS-07 | A token issued for a sibling Resource Server is refused with 401 | ITI-72 audience, security boundary |
| RS-08 | The 401 carries a WWW-Authenticate challenge | OAuth 2.1 / RFC 6750 error shape |
| RS-09 | Claims are checked against the transaction type and data | ITI-72: "shall verify that the claims conveyed in the access token match the transaction type and data" |
| RS-10 | **[option: Token Introspection]** The server introspects the token before granting access | ITI-102 |

**How the tokens get here.** A Resource Server test needs tokens it did not
issue: a valid one, an expired one, one for another audience, one with a narrow
scope. Minting them needs a signing key, so they are supplied as run-time
parameters — the operator pastes each one once. That is a deliberate trade: the
suite runs against any Authorization Server, at the cost of manual setup.

**RS-09 cannot be fully automated.** The profile does not say which claims bind
to which transaction, so the same 200 comes back whether the server checked or
not. The scenario establishes that the accepted token really did carry
consistent claims, and puts the judgement to the operator.

### Plan 2 — Authorization Server — [`iua-authorization-server.feature`](iua-authorization-server.feature)

| Case | Claim | Requirement |
|---|---|---|
| AS-01 | A client-credentials grant returns `token_type` Bearer, an `access_token` and a `scope` | ITI-71 response fields |
| AS-02 | An authorization-code grant with PKCE returns an access token | ITI-71 authorization code flow |
| AS-03 | **[jwt]** The issued token carries `iss`, `sub`, `client_id`, `aud`, `jti`, `exp`, `iat`, `scope` | ITI-71 JWT Token Option |
| AS-04 | **[jwt]** `exp` is in the future and `iat` is not | ITI-71 JWT Token Option |
| AS-05 | **[jwt]** `aud` names the requested resource | ITI-71 `resource` parameter |
| AS-06 | An unknown `grant_type` is refused with `unsupported_grant_type` | OAuth 2.1 §5.3 |
| AS-07 | Bad client credentials are refused with `invalid_client` | OAuth 2.1 §5.3 |
| AS-08 | A reused authorization code is refused with `invalid_grant` | OAuth 2.1, PKCE |
| AS-09 | A code exchanged without its `code_verifier` is refused with `invalid_grant` | ITI-71 PKCE |
| AS-10 | An error response is JSON carrying an `error` field | OAuth 2.1 §5.3 error shape |
| AS-11 | **[option: Metadata]** The metadata document declares `token_endpoint` | ITI-103 |
| AS-12 | **[option: Introspection]** Introspecting a valid token returns `active` true with its scope | ITI-102 |
| AS-13 | **[option: Introspection]** Introspecting an expired token returns `active` false and omits sensitive claims | ITI-102: the response "omits privacy/security-sensitive claims and does not indicate why" |

**AS-02, AS-08 and AS-09 need a human.** The authorization endpoint requires a
user to authenticate and consent at the server's own screens, so the operator
drives that part and pastes the code back. There is no way around it, and a
suite that pretended otherwise would just fail for the wrong reason.

**AS-04 is an operator attestation, not a computation.** `exp` and `iat` are
NumericDate, epoch seconds, and TDL has no epoch-seconds clock to compare
against. Computing it against the test bed's clock would also report a clock
difference between the test bed and the server as an expiry defect, which is the
wrong diagnosis for a real fault.

### Plan 3 — Authorization Client — [`iua-authorization-client.feature`](iua-authorization-client.feature)

The client initiates, so the shape is inverted: the test bed plays the
Authorization Server and the Resource Server, waits to be called, and asserts on
what arrives. The tokens are the test bed's own, so "the client sent the token it
was given" is a literal string comparison rather than an inference.

| Case | Claim | Requirement |
|---|---|---|
| AC-01 | The client requests a token as a form-encoded POST with a `grant_type` and client authentication | ITI-71 |
| AC-02 | The client presents the issued token as `Authorization: Bearer` | ITI-72 |
| AC-03 | The client does not present the token to a server outside its audience | security boundary |
| AC-04 | After a 401 the client obtains a fresh token rather than replaying the rejected one | ITI-71, ITI-72 |
| AC-05 | **[option: Metadata]** The client discovers `token_endpoint` from the metadata document | ITI-103 |

**Every scenario needs the client pointed at the test bed** rather than at a
real authorization server, and then triggered. The operator does that once per
run from the endpoints the session prints.

**AC-04 has two known weaknesses**, both written into the feature file beside
the scenario:

- the simulated 401 carries **no `WWW-Authenticate` challenge**, because the
  language can set a reply's status and body but not its headers. A client that
  re-authenticates only on seeing the challenge fails this for the wrong reason;
- a conformant client **may legitimately give up** after a 401 — the profile
  does not require a retry — so a timeout on the second token request is
  inconclusive rather than a failure.

This is the case most likely to need rewriting as an operator attestation, as
was already suspected at stage 2.

**AC-03 asserts an absence.** It establishes that *the token this test issued*
did not reach the foreign server. A client that sends some other credential
there still passes, which is correct: the profile does not forbid a client
holding other credentials.

**Totals.** 28 cases: 10 Resource Server, 13 Authorization Server, 5
Authorization Client. Nine inspect JWT claims; nine use the `oauth` verbs; six
are gated on a declared option; four rest on an operator's judgement.

## 4. What is still not decided

- **The system under test.** These tests need a reachable IUA implementation.
  None is configured.
- **Whether AC-04 survives contact with a real client.** See above.
- **Option gating.** Six cases apply only under a declared option and nothing
  enforces that. Until the harness can read a system's claimed options, the
  labels are the only mechanism.

## 5. Results

**Gate 1 — compilation: met.** 30 September 2026.

```
0 iua-authorization-client.feature  [5 test cases]
0 iua-authorization-server.feature  [13 test cases]
0 iua-resource-server.feature       [10 test cases]

clean: 3, with errors: 0
```

28 test cases, no errors and no warnings. The packaged suite is 57,962 bytes.
The generated TDL was additionally checked by hand for the things a compiler
does not catch: no backslashes anywhere (TDL-042), every variable declared and
typed (TDL-040/041), form bodies carrying only the parameters their scenario
actually wrote, the client-authentication header surviving the verbs that follow
it, and every `btxn` matched by an `etxn`.

**Gate 2 — running against a real ITB: NOT MET.**

Two separate blockers, and neither is a defect in the tests:

1. **There is no IUA system under test.** No Authorization Server, Resource
   Server or Authorization Client is configured to measure, so there is nothing
   for the suite to be run against.
2. **The Interoperability Test Bed is not running** on this machine (Docker is
   down), so not even a deploy-only check against the GITB schema was possible.

**Therefore: these 28 cases have never been executed. Nothing here is evidence
that any IUA implementation conforms, and nothing here is evidence that the
tests themselves pass.** A suite that has only compiled has established that its
sentences were understood — as section 2 shows, that is a weaker claim than it
looks.

The next step, when an ITB and an implementation exist: deploy the suite, run
it, and record the output and the build measured here. Expect the negative cases
to need scrutiny — a must-reject case that passes on the first run should be
checked by feeding it something valid and confirming it then fails, because a
test that cannot fail is not a test.
