# Generation 1 and generation 2, side by side

The test language has two generations. Generation 1 is frozen at spec version
1.7.0 and still loads; generation 2 is spec version 2.0.0 and is what new files
are written in. A feature file picks one with its first tag:

```gherkin
@lang:itb-core-en@^1.6      # loads lang/en-1.yml, the frozen generation
@lang:itb-core-en@^2        # loads lang/en.yml
```

Nothing in this repository has to be migrated. The golden corpus compiles both
generations in the same run, and two of its files are deliberately kept in the
old syntax so that stays true.

| | Generation 1 | Generation 2 |
|---|---|---|
| Spec version | 1.7.0 (frozen) | 2.0.0 |
| Language file | `lang/en-1.yml`, 1335 lines | `lang/en.yml`, 902 lines |
| How a step is declared | 73 regular expressions | 77 typed sentences |
| Distinct step texts accepted | 73 | about 130 |
| FHIR verbs | in the core | in the `fhir-validator` dialect |

## The same test, in both

This is the nominal-update scenario from the golden corpus, which keeps both
versions of the file so that both generations stay tested. The first block is
what it said before, the second what it says now. Nothing about the test itself
changed.

```gherkin
# ── generation 1 ────────────────────────────────────────────────────
@lang:itb-core-en@^1.6 @dialect:fhir-validator@^1.0
  Given DocumentResponder is the system under test at "https://example.org/fhir"
  And AuthServer is infrastructure at "https://example.org/auth"
  And set header "Accept" to "application/fhir+json"
  When DocumentSource posts to AuthServer at "/token" with:
    """
    { "grant_type": "client_credentials", "scope": "document" }
    """
  And extract "/access_token" as "iuaToken"
  And set bearer token from "iuaToken"

  When DocumentSource gets "https://example.org/files/doc.json" as "originalDoc"
  Then "originalDoc" should not be empty
  When DocumentSource posts to DocumentResponder at "/DocumentReference" with body "originalDoc"
  Then "response status" should be "201"
  And extract "/id" as "docId"
  When DocumentSource puts to DocumentResponder at "/DocumentReference/" with id "docId" and body "updatePayload"
  Then "response status" should be "200"
  When DocumentSource gets from DocumentResponder at "/DocumentReference/" with id "docId" as "updated"
  And evaluate FHIRPath "DocumentReference.status" on "updated" and expect "current"
  And "updated" conforms to "http://fhir.ch/ig/ch-epr-fhir/StructureDefinition/ch-mhd-documentreference-comprehensive"
```

```gherkin
# ── generation 2 ────────────────────────────────────────────────────
@lang:itb-core-en@^2 @dialect:fhir-validator@^2
  Given DocumentResponder is the system under test at "https://example.org/fhir"
  And AuthServer is infrastructure at "https://example.org/auth"
  And FHIRValidator is a fhir-validator at "http://fhir-validator:8081"
  And set header "Accept" to "application/fhir+json"
  When DocumentSource posts to AuthServer at "/token" with:
    """
    { "grant_type": "client_credentials", "scope": "document" }
    """
  And extract "/access_token" as $iuaToken
  And set bearer token from $iuaToken

  When DocumentSource gets "https://example.org/files/doc.json" as $originalDoc
  Then $originalDoc should not be empty
  When DocumentSource posts to DocumentResponder at "/DocumentReference" with body $originalDoc
  Then $response.status should be 201
  And extract "/id" as $docId
  When DocumentSource puts to DocumentResponder at "/DocumentReference/" with id $docId with body $updatePayload
  Then $response.status should be 200
  When DocumentSource gets from DocumentResponder at "/DocumentReference/" with id $docId as $updated
  And $updated at "DocumentReference.status" should be "current"
  And $updated should conform to "http://fhir.ch/ig/ch-epr-fhir/StructureDefinition/ch-mhd-documentreference-comprehensive"
```

## What changed, and why

### A variable is `$name`, not a quoted string

Generation 1 wrote every name in quotes, so a name and a literal looked the
same and only position told them apart. Reading `"200"` you could not tell
whether it was a value or a variable holding one.

```gherkin
extract "/id" as "docId"          →   extract "/id" as $docId
"docId" should not be empty       →   $docId should not be empty
set "cutoff" to now               →   set $cutoff to now
```

Nested access came through braces and now comes through dots:

```gherkin
"lastReceived{method}"            →   $received.method
"manifest{files}{location}"       →   $manifest.files.location
```

### The well-known values have names

Generation 1 reserved certain quoted strings and documented them in a comment.
Generation 2 declares them in the language file under `refs:`, so the compiler
knows them and an unknown one is an error rather than a silently empty string.

```gherkin
"response status" should be "200" →   $response.status should be 200
"validation errors" should be "0" →   $validation.errors should be 0
```

### Numbers and booleans lost their quotes

```gherkin
Then "response status" should be "200"    →   Then $response.status should be 200
Then "found" should be "true"             →   Then $found should be true
And ... receives a request ... within "30" seconds
                                          →   ... within 30 seconds
```

### An actor can have a kind, and the kind decides who does the work

This is the largest change. Generation 1 had one way to introduce a service:
declare it as infrastructure and then name it again in every step that used
it. Generation 2 gives the actor a kind, which is the id of a dialect.

```gherkin
# generation 1
Given FHIRValidator is available at "http://fhir-validator:8081"
And User validates "bundle" against "http://…/Bundle-uv-ips" on FHIRValidator

# generation 2
Given FHIRValidator is a fhir-validator at "http://fhir-validator:8081"
And User validates $bundle against "http://…/Bundle-uv-ips"
```

Because the compiler knows which dialect owns the actor, `on FHIRValidator`
becomes optional, and a sentence such as `should conform to` can be written
once in the core and routed to whichever validator is in scope.

### A value can have a type, and the type decides how a path is read

```gherkin
Given $bundle is a FHIR resource
Then $bundle at "Bundle.entry.count()" should be at least 1
```

A path starting with a slash is a JSON pointer whatever the value is. Any
other path goes to the evaluator registered for that value's type, which is
FHIRPath for a FHIR resource and a fact path for an X.509 certificate.
Generation 1 had no types and no path dispatch, so each of these needed its
own step.

### FHIRPath steps became ordinary assertions with a path

The `fhir-validator` dialect used to carry six FHIRPath steps of its own, one
per thing you might want to ask. Generation 2 dropped all six, because the
core comparators now take a path and the value's type says to read it as
FHIRPath.

```gherkin
evaluate FHIRPath "X" on "y" and expect "z"   →   $y at "X" should be "z"
evaluate FHIRPath "X" on "y" as "z"           →   extract "X" from $y as $z
evaluate FHIRPath "X" and expect "z"          →   $response.body at "X" should be "z"
evaluate FHIRPath "X" exists                  →   $response.body at "(X).exists()" should be true
evaluate FHIRPath "X" count is 3              →   $response.body at "(X).count()" should be 3
assert FHIRPath "X" on "y"                    →   $y should satisfy "X"
```

### There are far more ways to check a value

Generation 1 had six comparators: is, is not, contains, does not contain, is
not empty, and equals another minus a number. Generation 2 has fifteen, and
all but the last of those also take a path.

```gherkin
$bundle should be one of "final, amended"
$bundle should match "^Bundle/[A-Za-z0-9-]+$"
$bundle should exist
$bundle should be empty
$bundle at "Bundle.entry.count()" should be at least 1
$bundle at "Bundle.entry.count()" should be less than 100
```

### `conforms to` became `should conform to`

Every assertion now starts with the subject and the word `should`, so
assertions are recognisable on sight. `downgrading` became `ignoring`, which
is what it does.

```gherkin
"x" conforms to "P" downgrading slicing errors
                    →   $x should conform to "P" ignoring slicing errors
"x" conforms to "P" downgrading errors matching "Slicing.*"
                    →   $x should conform to "P" ignoring errors matching "Slicing.*"
```

### Options moved out of the sentence and into a table

Generation 1 grew a new step for every option. Generation 2 takes them as a
table, so a new option does not change the language.

```gherkin
# generation 1
validate "x" against "P" with best practice "ignore"
validate "x" against "P" with resource id "pat-1"

# generation 2
User validates $x against "P" with:
  | option       | value  |
  | bestPractice | ignore |
  | resourceId   | pat-1  |
```

### Dialect verbs assert their own success

In generation 1 every service call was followed by a status check, and
forgetting it made the test pass when the service was down. In generation 2 a
dialect verb fails on its own transport error, so the check is gone.

```gherkin
# generation 1
When User loads IG "hl7.fhir.uv.ips#2.0.0" on FHIRValidator
Then "response status" should be "200"

# generation 2
When User loads IG "hl7.fhir.uv.ips#2.0.0" on FHIRValidator
```

The raw HTTP verbs still do not assert anything, because there the status is
part of what the test is checking.

### FHIR left the core

Generation 1's core language knew about FHIR. It carried `loads IG`,
`parses FML`, `registers StructureMap`, `transforms … with map`,
`validates … targeting` and `should be a valid <Type> resource`, and its
`conforms to` emitted a call to a FHIR validator. Generation 2's core carries
none of them: they are verbs of the `fhir-validator` dialect. The one that
stayed is `should conform to`, and it stayed by becoming generic, dispatched
to whichever validator owns the value.

That is what makes a dialect for terminology, health certificates, X.509 or
ArchiMate possible without touching the language. The same move made the FHIR
dialect smaller as well: 29 patterns in generation 1, 21 sentences now, with
more capability than before.

### Hidden state was made explicit

Some generation 1 verbs chained through state that the file never named. The
health-certificate pipeline was the worst of it: each step silently consumed
the previous step's output, so a reader could not tell what was flowing.

```gherkin
# generation 1
When User uploads a QR image to HCertDecoder
And User decodes HC1 on HCertDecoder
And User extracts metadata on HCertDecoder

# generation 2
When User uploads a file as $qrImage
And User scans $qrImage on HCertDecoder as $qrData
And User decodes $qrData on HCertDecoder as $hcert
And User extracts metadata from $hcert on HCertDecoder as $metadata
```

### The operator can be asked things

Generation 1 could show a message and collect one value. Generation 2 adds
file upload, evidence capture and a checklist, so a requirement about what a
system displays can be tested rather than left out.

```gherkin
When User uploads a file as $screenshot with "a screenshot of the summary"
And User submits evidence of "the allergy list on screen" as $evidence
Then User confirms each of these is displayed:
  | item                            |
  | The allergy list is on screen   |
  | Each allergy shows its reaction |
```

### One thing was removed: inline conditionals

Generation 1 had three conditional steps. They have no generation 2 form.

```gherkin
if "x" is not empty then "y" should be "z"
if "x" is "a" then "y" should be "z"
if "x" is not empty then "y" should contain "z"
```

A condition inside an assertion hides a branch that the report cannot show:
the step passes whether or not the interesting case was exercised. Split it
into two scenarios, or make the precondition an assertion of its own. The
converter leaves these lines as a comment for a person to decide.

## How the language file itself changed

Generation 1 declared each step as a regular expression:

```yaml
- match: '^([A-Za-z][A-Za-z0-9_]*) is the system under test (?:on|at) "?(https?://[^"\s]+)"? as defined by "?(https?://[^"\s]+)"?$'
```

Generation 2 declares it as typed text:

```yaml
- text: '{actor} is the system under test( at {url})?( as defined by {canonical})?'
```

Three consequences:

- **Optional parts collapse the file.** Generation 1 needed one regex per
  combination, so declaring an actor took thirteen patterns and calling a
  scriptlet took four. Generation 2 does both in five sentences. That is why
  the file shrank by a third while accepting nearly twice as many step texts.
- **The slot types are checked.** `{url}`, `{canonical}`, `{int}` and `{var}`
  say what belongs there, so a malformed argument is reported against the
  step rather than producing a suite that fails at run time.
- **A dialect author writes sentences, not regular expressions.** A dialect
  adds verbs, actor kinds and value types. It cannot add a sentence shape,
  which is what keeps every dialect reading the same way.

## Migrating a file

```
node scripts/convert-v1-to-v2.mjs <file-or-dir>...    # rewrites in place
node scripts/convert-v1-to-v2.mjs --check <file>      # prints the result
```

The script lives in the language package. It handles the mechanical mappings
above, and it rewrites the health-certificate pipeline into its explicit form.
It leaves alone anything it cannot map, including the conditionals, so the
compiler reports those lines and a person decides. Doc strings, tables and
comments are untouched.

If you would rather not migrate, change nothing: keep the `@lang:itb-core-en@^1`
tag and the file keeps compiling.

## Where to go next

- [EXPRESSIONS.md](EXPRESSIONS.md) — every sentence of generation 2, with an example of each
- [TUTORIAL.md](TUTORIAL.md) — the long-form introduction
- [GRAMMAR.md](GRAMMAR.md) — the formal grammar and the dialect contract
- [REFERENCE.md](REFERENCE.md) — step-by-step reference
