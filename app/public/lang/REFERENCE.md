# OTB Gherkin — Step Reference (generation 2)

Every step the core and the bundled dialects provide, with an example.
Optional parts are in `[brackets]`; `$x` is a variable; `<Actor>` is a bare name.

## Declarations

| Step | Example |
|---|---|
| `<Actor> is the system under test [at "url"] [as defined by "canonical"]` | `Client is the system under test at "http://sut:8080/fhir"` |
| `<Actor> is infrastructure [at "url"] [as defined by "canonical"]` | `AuthServer is infrastructure at "https://…/auth"` |
| `<Actor> is available [as "name"] [at "url"] [as defined by "canonical"]` | `FHIRServer is available` |
| `<Actor> is a <kind> [at "url"] [as defined by "canonical"]` | `FHIRValidator is a fhir-validator at "http://fhir-validator:8080"` |
| `<Actor> is configured with data pool "id"` | `FHIRServer is configured with data pool "default"` |

Kinds: `fhir-validator`, `hcert-decoder`, `smart-helper`, `tng-validator`,
`archimate-repository`, `eira-validator`. With one actor of a kind declared,
`on <Actor>` can be omitted from that dialect's steps.

## HTTP (raw transport — assert the status yourself)

| Step | Example |
|---|---|
| `<Actor> posts to <Actor> at "path" [with id $x | "id"] with:` + doc string | `Client posts to Server at "/Patient" with:` |
| `<Actor> posts to <Actor> at "path" [with id $x | "id"] with body $y` | `Source posts to Responder at "/DocumentReference" with body $doc` |
| `<Actor> puts to …` / `<Actor> patches to …` (same forms) | `Source puts to Responder at "/DocumentReference/" with id $docId with body $update` |
| `<Actor> deletes on <Actor> at "path" [with id $x | "id"]` | `User deletes on FHIRServer at "/Patient/" with id $id` |
| `<Actor> gets from <Actor> at "path" [with id $x | "id"] as $y` | `Client gets from Spenser at "/metadata" as $metadata` |
| `<Actor> gets "absolute url" as $y` | `Client gets "https://…/fixture.json" as $payload` |
| `<Actor> posts $body to <Actor> at "path" N times, paced manually` | `Client posts $order to Spenser at "/MedicationRequest" $N times, paced manually` |
| `set header "Name" to "value"` / `to $var` | `set header "Accept" to "application/fhir+json"` |
| `set bearer token from $token` | `set bearer token from $iuaToken` |

`with id $x` appends a run-time value to the path; keep the trailing slash in the path.

## ITB as the peer

| Step | Example |
|---|---|
| `<Actor> waits for <Actor> [within N seconds]` | `Responder waits for Consumer within 300 seconds` |
| `<Actor> is listening for <Actor>` | `Responder is listening for Source` |
| `<Actor> receives a request from <Actor> [within N seconds]` | `Responder receives a request from Source within 300 seconds` |
| `<Actor> replies to <Actor> with status N and:` + doc string / `and body $x` | `Responder replies to Source with status 200 and:` |
| `<Actor> stops listening for <Actor>` | `Responder stops listening for Source` |
| `wait N seconds` | `wait 5 seconds` (logged only) |

What arrived: `$received.method`, `$received.path`, `$received.headers.Accept`, `$received.body`.

## Binding

| Step | Example |
|---|---|
| `set $x to "value"` / `to 42` / `to $y` | `set $tngCountry to "XXR"` |
| `set $x to:` + doc string | `set $patient to:` |
| `set $x to now [with format "pattern"]` | `set $nowTs to now` |
| `extract "path" from $y as $x` | `extract "/name/0/family" from $patient as $family` — JSON pointer on anything; `extract "Patient.name.family" from $patient as $family` — FHIRPath on a FHIR resource |
| `extract "/pointer" as $x` | from the last response body |
| `$x is a <type name>` | `$received.body is a FHIR resource` — types an untyped value |

## Assertions

Every comparator works on `$x` and on `$x at "path"`.

| Comparator | Example |
|---|---|
| `should be` / `should not be` | `$response.status should be 201`, `$fam should be "Dupont"`, `$m should be $n` |
| `should contain` / `should not contain` | `$received.path should contain "patient="` |
| `should be empty` / `should not be empty` / `should exist` / `should not exist` | `$docId should not be empty` |
| `should match "regex"` | `$id should match "^[a-z0-9-]+$"` |
| `should be one of "a, b"` | `$status should be one of "current, superseded"` |
| `should be at least` / `at most` / `greater than` / `less than` | `$validation.errors should be greater than 0` |
| `should equal $y minus N` | `$after should equal $before minus $N` |
| at a path | `$bundle at "Bundle.type" should be "document"`, `$cert at "/keyUsage/digitalSignature" should be true` |

Well-known: `$response.status`, `$response.body`, `$validation.errors`,
`$validation.warnings`, `$validation.severity`, `$validation.outcome`.

## Conformance

| Step | Example |
|---|---|
| `$x should conform to "canonical" [on <Actor>]` | `$bundle should conform to "https://profiles.ihe.net/PHARM/MEOW/StructureDefinition/MedicationOverview"` |
| `… ignoring slicing errors` | `$bundle should conform to "…LACBundleIPS" ignoring slicing errors` |
| `… ignoring errors matching "phrase"` | `$bundle should conform to "…" ignoring errors matching "max allowed = 1"` |
| `… with:` + `\| option \| value \|` | `$model should conform to "https://eira.ec.europa.eu/eira/6.0" with:` |
| `$x should not conform to "canonical"` | `$badAllergy should not conform to "…be-allergyintolerance"` |

After any conformance check, `$validation.errors` and friends are set.

## Interaction

| Step | Example |
|---|---|
| `<Actor> is informed "message" [with $content]` | `Monitor is informed "Please review." with $patient` |
| `<Actor> is asked for $x [with "prompt"]` | `User is asked for $pin with "Enter the PIN"` |
| `<Actor> uploads a file as $x [with "prompt"]` | `User uploads a file as $qrImage` |
| `<Actor> confirms each of these is <word> [for "what"]:` + table `\| item \| detail \|` | `Consumer confirms each of these is displayed for "the allergy list":` — one dialog, a Yes/No per row, one verdict per row |
| `<Actor> submits evidence of "what" as $x` | `Consumer submits evidence of "the allergy list displayed" as $allergyEvidence` — one dialog: instruction, required file, optional note in `$allergyEvidence_note` |
| `log "message"` / `log $x` | `log "checkpoint"` |
| `call scriptlet "id" [as $x] [with: table] [doc string]` | see GRAMMAR.md |

---

## Dialect: fhir-validator

| Step | Example |
|---|---|
| `<Validator> is loaded with package "id#version"` | `FHIRValidator is loaded with package "hl7.fhir.be.core#2.1.2"` |
| `<Actor> loads IG "id \| url \| path" [on <Validator>]` | `User loads IG "https://smart.who.int/icvp/package.tgz" on FHIRValidator` |
| `<Actor> validates $x against "profile" [on <Validator>] [as $outcome]` | then `$validation.errors should be 0` |
| `<Actor> validates $x against "profile" [on <Validator>] with:` `\| option \| value \|` (`bestPractice`, `resourceId`) | |
| `$x should be a valid <Type> resource` | `$patient should be a valid Patient resource` |
| `$x at "fhirpath" should …` | `$patient at "Patient.name.family" should be "Dupont"` |
| `<Actor> evaluates "fhirpath" on $x [using <Validator>] as $y` | for values the compiler cannot type |
| `$x should satisfy "fhirpath"` | `$patient should satisfy "Patient.id.exists()"` |
| `$x should match pattern:` / `should not match pattern:` + doc string | matchetype comparison |
| `<Actor> summarizes $outcome [on <Validator>] as $s` | then `$s.errors should be 0` |
| `<Actor> generates test data from "profile" [on <Validator>] as $x` | |
| `<Actor> generates required test data from "profile" [on <Validator>] as $x [with values:]` | `\| path \| value \| system \| code \|` |
| `<Actor> generates required test data from "profile" with mappings $m [on <Validator>] as $x` | |
| `set $m to mappings:` / `set $m to mappings with parts:` / `set $d to data:` | tables |
| `<Actor> modifies $x [against "profile"] [on <Validator>] with operations:` | `\| op \| path \| value \| system \| code \|` |
| `<Actor> transforms $in with map "canonical" [on <Validator>] as $out` | |
| `<Actor> parses FML $text [on <Validator>] as $map` | |
| `<Actor> registers StructureMap $map [on <Validator>]` | |

Types: `FHIR resource`, `FHIR OperationOutcome` (path language: FHIRPath).

## Dialect: hcert-decoder

| Step | Example |
|---|---|
| `<Actor> scans $image [on <Decoder>] as $qrData` | after `uploads a file as $image` |
| `<Actor> decodes $qrData [on <Decoder>] as $hcert` | |
| `<Actor> verifies the signature of $hcert [on <Decoder>] [with:]` `\| parameter \| value \|` | `gdhcn_env`, `usage`, `participant`, `domain`, … all defaulted |
| `<Actor> extracts metadata from $hcert [on <Decoder>] as $meta` | |
| `<Actor> extracts the SHL link from $hcert [on <Decoder>] as $link` | |
| `<Actor> authorizes $link [on <Decoder>] with pin $pin as $manifest` | |
| `<Actor> authorizes $link [on <Decoder>] with pin "0000" expecting status 401` | negative case |
| `<Actor> fetches the FHIR content of $manifest [on <Decoder>] as $bundle` | binds the first resource, typed FHIR |

Type: `health certificate` (read with `/…` pointers, e.g. `extract "/payload/1" from $hcert as $issuer`).

## Dialect: smart-helper

| Step |
|---|
| `<Actor> loads IG "url" [targeting "fhir"] on <Helper>` |
| `<Actor> validates $x against "profile" on <Helper>` |
| `<Actor> validates $x against "profile" on <Helper> targeting <FHIRServer>` |
| `<Actor> transforms $in with map "canonical" on <Helper> as $out` |

## Dialect: tng-certificate

| Step |
|---|
| `set $tngCountry to "XXR"` (the participant) |
| `<Actor> inspects the participant material [on <TNG>] as $cert` |
| `<Actor> inspects group "TLS" file "TLS" [on <TNG>] as $cert` / `inspects group "SCA" … as $cert` |
| `<Actor> inspects the TLS end-entity [on <TNG>] as $tls` / `inspects the CA beside it … as $ca` / `inspects the DSC issued by $sca … as $dsc` |
| `$cert should be placed at domain, group and filename` |
| `$cert public key should satisfy the minimum size:` `\| algorithm \| minBits \|` |
| `$cert public key algorithm should be one of "RSA, EC(P-256)"` |
| `$cert extension "2.5.29.15" should be present` |
| `$cert keyUsage "digitalSignature" should be true` |
| `$cert EKU should include "1.3.6.1.5.5.7.3.2"` / `$cert EKU should not be required for groups "CA, SCA"` |
| `$cert basicConstraints CA should be true` [`for groups:` table] / `$cert basicConstraints pathLen should be "0 or absent"` |
| `$tls should be signed by $ca` / `$tls should be rejected by $ca` |
| `$cert subject CN should not be empty` / `$cert subject country should be the participant country` |
| `$cert validity should not exceed the limit for its group:` `\| group \| maxYears \|` |
| `$dsc notAfter should not exceed $sca notAfter` |

Type: `X.509 certificate` (facts; `$cert at "/keyUsage/keyCertSign" should be true` is the same check in core form).

## Dialect: archimate

| Step |
|---|
| `<Actor> loads model "name" [from <Repo>] as $model` |
| `<Actor> lists the views of $model [on <Repo>] as $views` |
| `$model at "<model query>" should …` |
| `$model should conform to "<EIRA canonical>" [with: \| option \| value \|]` |

Type: `ArchiMate model` (path language: the validator's model query).
