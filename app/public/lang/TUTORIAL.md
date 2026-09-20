# OTB Gherkin — a tutorial

This is the long-form introduction to the test language: what a feature file
is, how to write one, what each sentence means, how a line becomes an ITB
test step, and how the language itself is defined and extended. It is meant
to be read once, top to bottom. The short documents beside it are for later:
[README-language.md](README-language.md) is the one-page summary,
[GRAMMAR.md](GRAMMAR.md) the formal grammar, [REFERENCE.md](REFERENCE.md)
every step with an example.

Contents

1. [What you are writing](#1-what-you-are-writing)
2. [Your first feature](#2-your-first-feature)
3. [The language, shape by shape](#3-the-language-shape-by-shape)
4. [How a line becomes an ITB step](#4-how-a-line-becomes-an-itb-step)
5. [The meta-grammar: how steps are defined](#5-the-meta-grammar-how-steps-are-defined)
6. [The meta-concepts: generations, dialects, governance](#6-the-meta-concepts-generations-dialects-governance)
7. [What the compiler checks for you](#7-what-the-compiler-checks-for-you)
8. [Where to go next](#8-where-to-go-next)

---

## 1. What you are writing

### A test is data

The Interoperability Test Bed (ITB) runs test cases written in its Test
Description Language, TDL. TDL is XML: a test case declares its actors and
variables and then lists steps: send a message, receive one, validate
something, ask a person to do something, decide pass or fail. Because a test
is a file rather than code inside a tool, it can be published, versioned,
reviewed and run on any ITB instance.

TDL is precise and complete, and also long. The step "this resource conforms
to that profile, ignoring slicing errors" is one line of Gherkin and about
fifty of TDL. This language exists so that the person who knows what must be
tested can write and review the test, and the compiler produces the TDL.

So the pipeline is:

```
feature file (.feature)  ──compile──▶  TDL test suite (.zip of XML)  ──deploy──▶  ITB
```

The compiler is `@opentestbed/otb-gherkin`. The authoring app, the `otb`
command line and the test manager all use it, so the three never disagree.

### Actors and roles

Every test case is a conversation between actors. Exactly one kind of actor
matters to the verdict: the **system under test** (SUT), the thing whose
conformance is being measured. Everything else is **simulated**: ITB plays it,
or it is a service ITB calls. In TDL these are the two roles, `SUT` and
`SIMULATED`, and they decide two things:

- Messages ITB sends go *from* a simulated actor *to* the SUT, or the other
  way round when the SUT is the client and ITB stands in for the server.
- Anything that needs a person, an instruction on screen, a file to upload,
  a yes or no, is shown to the tester of the SUT. ITB will not deploy a test
  that addresses an interaction to a simulated actor.

A test case must declare at least one SUT. The compiler tells you when it
does not.

### Dialects and plugins

The **core language** knows how to talk HTTP, wait for a peer, bind values,
compare them, and ask a person something. It does not know what a FHIR
resource is. That knowledge comes from **dialects**, one per plugin service:
the FHIR validator brings "loads IG", "validates against", FHIRPath and
StructureMap transforms; the health-certificate decoder brings "scans",
"decodes", "verifies the signature". A dialect is shipped inside its plugin
and served by the running service, so the authoring app always offers the
words of the services that are actually deployed.

Two rules keep this manageable. A dialect adds **verbs, actor kinds, value
types and a conformance handler**. It never adds a new sentence shape; there
are six of those and they belong to the core.

### Values and types

Anything a step produces is bound to a variable, `$name`, and read by later
steps. Some values have a **type**, and the type decides which language reads
paths inside it: a FHIR resource is read with FHIRPath, an X.509 certificate
with a fact path, anything at all with a JSON pointer (`/…`). A value gets its
type from the step that bound it, or you declare it: `$body is a FHIR resource`.

---

## 2. Your first feature

Here is a complete, runnable feature. It tests an IPS Consumer: a system that
receives an International Patient Summary and displays it. Because "displays"
is behaviour a person has to confirm, this feature mixes automated checks with
questions to a tester.

```gherkin
@lang:itb-core-en@^2 @dialect:fhir-validator@^2 @actor:Consumer @spec:hl7.fhir.uv.ips@2.0.1
Feature: IPS Consumer — obligations of hl7.fhir.uv.ips 2.0.1
  An IPS Consumer receives an IPS document and uses its content.

  Background:
    Given Consumer is the system under test
    And Tester is infrastructure
    And FHIRValidator is a fhir-validator at "http://fhir-validator:8080"
    And FHIRValidator is loaded with package "hl7.fhir.uv.ips#2.0.1"
    When Tester gets "https://hl7.org/fhir/uv/ips/Bundle-bundle-ips-all-sections.json" as $ips
    Then $ips should conform to "http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips" ignoring slicing errors
    And Consumer is informed "Import this International Patient Summary into the system under test, then answer the questions that follow." with $ips

  Rule: The document: Bundle and Composition

    @profile:Bundle-uv-ips
    Scenario: ips-consumer-001 Bundle (IPS) — the Consumer handles 3 elements and displays 1
      When Consumer submits evidence of "the import completing without error (log or screenshot)" as $handledBundleEvidence
      Then Consumer confirms each of these is accepted for "the document":
        | item              | detail |
        | identifier        |        |
        | timestamp         |        |
        | entry:composition |        |
      When Consumer is informed "Open the patient's summary and display the document."
      And Consumer submits evidence of "the document displayed (screenshot)" as $displayedBundleEvidence
      Then Consumer confirms each of these is displayed for "the document":
        | item              | detail |
        | entry:composition |        |
```

Read it line by line.

**The tags.** `@lang:itb-core-en@^2` says which generation of the core
language the file is written for; `@dialect:fhir-validator@^2` names a
dialect it needs and the version range it expects. The compiler checks both
against what is loaded and reports a mismatch by name. `@actor:` and `@spec:`
are metadata for the test package: which actor of which specification this
feature covers. Tags are lowercased and may not contain spaces, so anything
path-shaped goes elsewhere (see the `# itb:` header in section 3).

**Feature and description.** The feature title becomes the test suite name;
the indented prose beneath it is the suite description.

**Background.** These steps run at the start of every scenario. It is where
actors are declared and shared setup happens.

**Declarations.** `Consumer is the system under test` makes Consumer the SUT.
`Tester is infrastructure` declares a simulated actor with no particular kind;
it exists so that "someone fetches the example file" has a subject.
`FHIRValidator is a fhir-validator at "…"` declares a service of the kind the
FHIR dialect provides, with its endpoint. Once one actor of a kind is
declared, that dialect's steps can leave `on FHIRValidator` out.

**A dialect action.** `FHIRValidator is loaded with package "…"` is a verb
from the FHIR dialect: it calls the validator's IG manager and asserts the
call succeeded.

**A core action.** `Tester gets "https://…" as $ips` is raw HTTP from the
core. It fetches the URL and binds the body to `$ips`. Core HTTP steps do not
assert the status, because in a conformance test the status is often the
thing under test.

**Conformance.** `$ips should conform to "…" ignoring slicing errors` is the
fourth sentence shape. The core does not know how to validate; it dispatches
to the dialect that owns the value or the only validator declared, and asserts
the error count that dialect leaves behind.

**Interaction.** `Consumer is informed "…" with $ips` shows a message and the
document to the SUT's tester. In a scenario, `submits evidence of … as $x`
asks for a file and an optional note, and `confirms each of these is
accepted for "…":` shows one dialog with a yes or no per table row and
records one verdict per row.

**Rule.** A `Rule:` groups scenarios under a heading. It is Gherkin 6 syntax
and has no effect on the compiled output beyond grouping.

**Scenario.** Each scenario becomes one test case. The scenario title becomes
the test case id (lowercased, punctuation to dashes) and its name; start it
with a stable identifier like `ips-consumer-001` so a TestPlan can refer to it.

Compile it in the authoring app and you get one test suite XML, one test case
XML per scenario, and any scriptlets they call. Section 4 shows what is in
them.

---

## 3. The language, shape by shape

Every step in the core and in every dialect is one of six shapes. If you can
tell which shape a line is, you can read any feature written in any dialect.

### Lexical rules

| Thing | Looks like | Notes |
|---|---|---|
| Actor | `FHIRValidator`, `Consumer` | bare PascalCase identifier |
| Variable, written | `as $bundle`, `set $x to` | `$` plus a name |
| Reference, read | `$bundle`, `$response.status`, `$a.b.c` | a dotted path reads into a map |
| Literal | `"text"`, `200`, `true` | numbers and booleans need no quotes |
| Kind | `fhir-validator` | lower-kebab, a plugin's component id |
| Doc string | `"""` … `"""` on the lines after a step ending in `:` | verbatim body |
| Table | `\| a \| b \|` rows after a step ending in `:` | first row is the header |

Whitespace between words collapses; text inside quotes is kept as is.

### Well-known references

Some references are always available, whatever the dialect:

| Reference | Meaning |
|---|---|
| `$response.status`, `$response.body`, `$response.headers` | the last HTTP response ITB made; `$response` alone is the body |
| `$received.method`, `.path`, `.headers.<Name>`, `.body` | the last request ITB received while playing a peer |
| `$validation.errors`, `.warnings`, `.severity`, `.outcome` | the last conformance check |

### Shape 1: Declaration

```gherkin
Consumer is the system under test
Consumer is the system under test at "http://sut:8080/fhir" as defined by "http://…/ActorDefinition/consumer"
Tester is infrastructure
AuthServer is available at "https://…/auth"
FHIRValidator is a fhir-validator at "http://fhir-validator:8080"
```

The SUT compiles to `role="SUT"`, everything else to `role="SIMULATED"`.
`as defined by` records the canonical of the ActorDefinition, which is how a
test package says which actor of a specification a test measures. An actor
with an endpoint gets a `$<Actor>Base` variable that dialect steps use to
build URLs.

### Shape 2: Action

```
<Actor> <verb> [$value] [on|to|from <Actor>] [qualifiers] [as $out]
```

Actions start with the actor doing them. The target is introduced by `on`
for a service and `to` or `from` for a peer. A result is always bound with
`as $x`; no step leaves its result in a hidden variable.

Core actions are the HTTP verbs, the peer steps, and scriptlet calls:

```gherkin
Client posts to Server at "/Patient" with:
  """
  { "resourceType": "Patient" }
  """
Client posts to Server at "/Patient" with body $patient
Client gets from Server at "/Patient/" with id $id as $fetched
Client gets "https://example.org/fixture.json" as $fixture
set header "Accept" to "application/fhir+json"
set bearer token from $token
```

Dialect actions read the same way:

```gherkin
User loads IG "https://smart.who.int/icvp/package.tgz" on FHIRValidator
User validates $bundle against "http://…/StructureDefinition/X" as $outcome
User transforms $cda with map "http://…/StructureMap/cda-to-fhir" as $bundle
User scans $qrImage on HCertDecoder as $qrData
```

One rule distinguishes the two: a dialect verb that calls a service asserts
that the call succeeded. A raw HTTP step does not.

### Shape 3: Assertion

```
$value [at "path"] should [not] <comparator> [value]
```

```gherkin
$response.status should be 200
$family should be "Dupont"
$received.path should contain "patient="
$docId should not be empty
$id should match "^[a-z0-9-]+$"
$status should be one of "current, superseded"
$validation.errors should be greater than 0
$bundle at "Bundle.type" should be "document"
$patient at "/name/0/family" should be "Dupont"
```

The comparators are `be`, `contain`, `be empty`, `exist`, `match`, `be one
of`, `be at least`, `be at most`, `be greater than`, `be less than`, `equal
… minus …`, each with a `not` form where it makes sense.

`at "path"` evaluates the path first. A path that starts with `/` is a JSON
pointer and works on any value. Any other path is handed to the value's type:
FHIRPath for a FHIR resource, a model query for an ArchiMate model. If the
value has no type, the compiler says so and tells you how to give it one.

### Shape 4: Conformance

```gherkin
$bundle should conform to "http://…/StructureDefinition/Bundle-uv-ips"
$bundle should conform to "…" on FHIRValidator
$bundle should conform to "…" ignoring slicing errors
$bundle should conform to "…" ignoring errors matching "max allowed = 1"
$badAllergy should not conform to "…"
$model should conform to "https://eira.ec.europa.eu/eira/6.0" with:
  | option | value |
  | layer  | legal |
```

The core dispatches the check to a dialect: the named actor's, else the
dialect owning the value's type, else the only declared actor whose dialect
can check conformance. Afterwards `$validation.errors` and friends are set.

### Shape 5: Binding

```gherkin
set $country to "XXR"
set $patient to:
  """
  { "resourceType": "Patient", "id": "p1" }
  """
set $now to now
extract "/id" from $response as $docId
extract "Patient.name.family" from $patient as $family
$received.body is a FHIR resource
```

`extract` with a `/…` pointer works on anything; with any other path it uses
the value's type. `$x is a <type>` is a compile-time declaration, not a step
ITB runs: it tells the compiler which dialect reads `$x`.

### Shape 6: Interaction

```gherkin
Consumer is informed "Open the summary." with $ips
User is asked for $pin with "Enter the SHL PIN"
User uploads a file as $qrImage
Consumer submits evidence of "the allergy list displayed" as $allergyEvidence
Consumer confirms each of these is displayed for "the allergy list":
  | item           | detail  |
  | clinicalStatus | active  |
  | type           | allergy |
```

Interactions are shown to the tester of the actor named, and that actor must
be the SUT. If you address one to a simulated actor, the compiler warns and
shows it to whoever is running the session instead. `submits evidence` binds
the uploaded file to `$x` and an optional note to `$x_note`. `confirms each of
these` is one dialog with a choice per row and one verdict per row, which is
how "SHALL handle" and "SHOULD display" obligations are tested.

### Tables, doc strings and the header block

A step that ends with `:` takes what follows: a doc string for a body, a
table for structured input. Which one a step wants is in its definition; the
Language Explorer in the app shows it, and the compiler reports a missing
table or missing columns.

Tags cannot carry paths, so path-shaped configuration goes in a YAML block
written as leading comments, which every other Gherkin tool ignores:

```gherkin
# itb:
#   scriptlets:
#     - ./shared-scriptlets
#     - https://raw.githubusercontent.com/OpenTestBed/itb-scriptlets/main
Feature: …
```

Today the block carries scriptlet locations, used by `call scriptlet "id"`,
the escape hatch to raw TDL.

### Two tags that change compilation

`@continue-on-error` compiles to `stopOnError="false"`: a failed check goes
red but the test case keeps running, useful for obligation checklists where
every row should get its verdict. `@lang:itb-core-en@^1` compiles the file
with the previous generation of the language; see section 6.

---

## 4. How a line becomes an ITB step

Understanding the compiled output makes the language less magic and the ITB
session reports easier to read. Here are four lines from the feature in
section 2 and what they compile to, taken from the real output.

**Declarations become the actors block.**

```gherkin
Given Consumer is the system under test
And Tester is infrastructure
And FHIRValidator is a fhir-validator at "http://fhir-validator:8080"
```

```xml
<actors>
  <gitb:actor id="Consumer" role="SUT"/>
  <gitb:actor id="Tester" role="SIMULATED"/>
  <gitb:actor id="FHIRValidator" role="SIMULATED"/>
</actors>
…
<assign to="FHIRValidatorBase">"http://fhir-validator:8080"</assign>
```

**A core HTTP step becomes a send and a binding.**

```gherkin
When Tester gets "https://hl7.org/fhir/uv/ips/Bundle-bundle-ips-all-sections.json" as $ips
```

```xml
<assign to="jsonHeaders{Accept}">"application/json"</assign>
<send id="lastRequest" desc="GET https://hl7.org/…" handler="HttpMessagingV2" from="Tester">
  <input name="uri">"https://hl7.org/fhir/uv/ips/Bundle-bundle-ips-all-sections.json"</input>
  <input name="method">"GET"</input>
  <input name="headers">$jsonHeaders</input>
</send>
<assign to="ips">$lastRequest{response}{body}</assign>
```

Every send is called `lastRequest`, which is what `$response.status` and
`$response.body` read. Binding `as $ips` copies the body into a variable of
your own, so later sends do not overwrite it.

**An assertion becomes a verify.**

```gherkin
Then $response.status should be 200
```

```xml
<assign to="sigStatus">if (empty($lastRequest{response}{status})) then "0" else $lastRequest{response}{status}</assign>
<verify handler="NumberValidator" desc="Response status is 200">
  <input name="actualnumber">$sigStatus</input>
  <input name="expectednumber">200</input>
</verify>
```

The guard turns an absent status, when the request never got a response,
into `0` so the failure is a wrong number rather than an ITB error.

**A checklist becomes an interact and a loop of verifies.**

```gherkin
Then Consumer confirms each of these is accepted for "the document":
  | item              | detail |
  | identifier        |        |
  | timestamp         |        |
```

```xml
<interact id="confirm" desc="For the document: is each of these accepted?" with="Consumer">
  <instruct desc="For the document, choose for each item below whether it is accepted." name="instruction"/>
  <request desc="identifier — " name="confirmed_1" inputType="SELECT_SINGLE" required="true" options="yes,no" optionLabels="accepted,not accepted">$confirmed{1}</request>
  <request desc="timestamp — " name="confirmed_2" inputType="SELECT_SINGLE" required="true" options="yes,no" optionLabels="accepted,not accepted">$confirmed{2}</request>
</interact>
<verify handler="StringValidator" desc="identifier is accepted for the document">
  <input name="actualstring">$confirmed{1}</input>
  <input name="expectedstring">"yes"</input>
</verify>
<verify handler="StringValidator" desc="timestamp is accepted for the document">
  <input name="actualstring">$confirmed{2}</input>
  <input name="expectedstring">"yes"</input>
</verify>
```

**The variables block is inferred.** TDL requires every variable to be
declared with a type. The compiler collects them from the steps: `lastRequest`
is a map because a send fills it, `confirmed` is a map because the interact
writes `$confirmed{1}`, `ips` is a string because an assign creates it. You
never write this block.

**The suite file.** One `testsuite` XML lists every test case and the union
of their actors, with each actor's ActorDefinition canonical in its
description when `as defined by` was given. The test manager uses that to
bind the suite to the right ITB actor.

---

## 5. The meta-grammar: how steps are defined

This section is for people who write dialects, and for authors who want to
know why a step behaves as it does. Every step, in the core and in every
dialect, is an entry in a YAML file. The core's is `lang/en.yml` inside the
compiler package; a dialect's is `dialect/steps.yml` in its plugin repository.

### A step entry

```yaml
- text: '{actor} loads IG {string}( on {actor:fhir-validator})?'
  doc: Load an IG package on the validator.
  actions:
    - assign: { to: 'loadIgTplParams{ig}', value: '"$2"' }
    - process:
        handler: 'TemplateProcessor'
        operation: 'process'
        output: 'loadIgBody'
        inputs:
          syntax: '"freemarker"'
          template: "'{ \"operation\": \"loadIG\", \"input\": [ { \"name\": \"ig\", \"value\": \"${ig?json_string}\", \"embeddingMethod\": \"STRING\" } ] }'"
          parameters: '$loadIgTplParams'
    - send:
        id: 'lastRequest'
        desc: 'Load IG $2'
        handler: 'HttpMessagingV2'
        to: '$target'
        inputs:
          uri: 'concat($targetBase, "/itb/igManager/process")'
          method: '"POST"'
          headers: '$fhirValidatorHeaders'
          body: '$loadIgBody'
    - verify:
        handler: 'NumberValidator'
        desc: 'IG $2 loaded (HTTP 200)'
        inputs: { actualnumber: '$lastRequest{response}{status}', expectednumber: '"200"' }
```

Three parts: the **text** the author types, the **doc** the app shows, and
the **actions** the compiler emits, as templates.

### Typed text

The text is not a regular expression. Each `{…}` placeholder names what the
slot *is*, and that type decides both what matches and what the templates
receive:

| Placeholder | Matches | `$N` in a template gives |
|---|---|---|
| `{actor}` | a PascalCase name | the actor id |
| `{actor:kind}` | an actor declared `is a <kind>`; filled in when omitted and unique | the actor id |
| `{var}` | `$name`, a binding target | `name` |
| `{ref}` | `$name` or `$a.b.c`, a value read | the TDL reference: `$name`, `$lastRequest{response}{status}` |
| `{value}` | `"literal"`, `$ref`, `42`, `true` | a TDL expression: `"literal"`, `$ref`, `"42"` |
| `{string}` `{path}` `{url}` `{canonical}` | `"…"` | the text between the quotes |
| `{int}` `{word}` `{kind}` | digits, one word, a component id | the text |
| `{type}` | a registered value type's display name | the type key |

`( … )?` marks an optional part, which may contain placeholders; `a/b/c`
matches one of several words. Everything else is literal text.

The types matter in three places. The compiler can check that an actor has
the kind a step needs, and fill in an omitted target when only one actor of
that kind is declared. It hands the templates an expression rather than raw
text, so `{value}` works whether the author wrote `"x"`, `$x` or `42`. And
the app knows what to offer at each slot.

### Template variables

Inside `actions`, these are substituted:

| Variable | Value |
|---|---|
| `$1`, `$2`, … | the slot's TDL expression |
| `$1.raw` | the text as captured, without quotes or `$` |
| `$$1` | `$` followed by the captured text, for building a variable name |
| `$opt.<name>` | the `value` of the row named `<name>` in a `\| option \| value \|` table |
| `$docString` | the doc string body |
| `$row.<col>`, `$row.__index` | the current table row inside `foreach` or `requestsFromTable` |
| `$target`, `$targetBase` | the dialect actor the parser resolved for `on <Actor>`, and its endpoint variable |
| `$subject`, `$path`, `$pathVar`, `$pathValue` | for path dispatch: the value, the path, the variable the path result lands in |
| `$profile`, `$ignore` | for conformance dispatch: the canonical and the ignore phrase |
| any `bind:` name | a value the entry binds for a dialect handler |

An omitted optional slot substitutes to `""`, and a trailing `""` argument of
a function call is dropped so `concat($Base, "/path", "")` reads as it
should. A literal `""` written in a template is left alone.

### The action vocabulary

Templates are written in the compiler's intermediate form, which maps onto
TDL steps one to one:

| Action | TDL | Used for |
|---|---|---|
| `declareActor` | `<gitb:actor>` | shape 1 |
| `assign` | `<assign to="…">` | set a variable or a map entry; `append: true` for lists |
| `send` | `<send from= to=>` | an HTTP call; `id: lastRequest` feeds `$response.*` |
| `receive`, `listen` | `<receive>`, `<listen>` | ITB as the peer |
| `process` | `<process handler= output=>` | a processing service: JSON pointer, FreeMarker template, FHIRPath |
| `verify` | `<verify handler=>` | a check that produces a verdict |
| `interact` | `<interact>` | instructions and requests to a person; `requestsFromTable` makes one request per table row |
| `foreach`, `repeat` | `<foreach>`, `<repeat>` | loops over `$tableRows` or a count |
| `call` | `<call>` | a scriptlet |
| `log` | `<log>` | the session log |
| `btxn`, `etxn` | transaction begin and end | messaging transactions |

Any action may carry `when: '$3'` or `unless: '$3'` and is then emitted only
when that value is, or is not, empty. This is how one entry serves both the
plain and the optional-part forms of a sentence.

### Dispatch

A few core entries do not have their own actions. They **dispatch** to the
dialect that owns the value:

```yaml
- text: '{ref} should conform to {canonical}( on {actor})? ignoring slicing errors'
  dispatch: conforms
  bind: { ignore: 'matching slice is required' }
  actions:
    - verify: { handler: 'StringValidator', desc: '$$1 conforms to $2 (ignoring slicing errors)',
                inputs: { actualstring: '$conformanceErrors', expectedstring: '"0"' } }
```

`dispatch: conforms` runs the chosen dialect's `conforms:` block first, with
`$subject`, `$profile` and the bound `$ignore`, and then the entry's own
actions. The contract between them is a variable: the handler leaves the
count of errors that matter in `$conformanceErrors`; the core asserts it.
`dispatch: path` does the same for `at "path"` through the value type's `path:`
block, and `dispatch: type` is the compile-time `$x is a <type>`.

### What a dialect file contributes

```yaml
id: fhir-validator
language: 2
kinds: [fhir-validator]            # "X is a fhir-validator at …"
types:
  fhir:Resource:
    name: FHIR resource            # "$x is a FHIR resource"
    path: *fhirpath                # how "at "Patient.name"" is evaluated
  fhir:OperationOutcome:
    name: FHIR OperationOutcome
    path: *fhirpath
conforms:
  actions: [...]                   # $subject, $profile, $ignore → $conformanceErrors
verbs:
  - text: '…'
    output: { type: 'fhir:Resource' }   # the type of the value this verb binds
    actions: [...]
```

`kinds` are the actor kinds the dialect's services can be declared as.
`types` are the value types it understands, each with a display name an
author can use and a path evaluator. `conforms` is its conformance handler.
`verbs` are its steps, restricted to shapes 2, 3, 5 and 6. `output.type`
tells the compiler what a verb binds, so `$x at "…"` works without a
declaration. YAML anchors (`&headers`, `*fhirpath`) are ordinary YAML and are
used to share blocks.

Two dialects may define the same sentence with different `{actor:kind}`
targets; the declared actors decide which one serves a line.

### The manifest

Beside `steps.yml`, `component.yml` declares the dialect to the tools:

```yaml
id: fhir-validator
name: FHIR Validator
implementsDialect: "^2.0"
language:
  steps: steps.yml         # the generation-2 dialect
  legacy: steps-v1.yml     # the generation-1 dialect, for @lang:…@^1 files
  version: "2.0.0"         # this dialect's own version
  base: itb-core-en        # the core it is written against
  baseVersion: ">=2 <3"    # the core versions it is compatible with
```

### Where dialects live and how they travel

The plugin repository is the source of truth: `dialect/steps.yml`,
`dialect/component.yml`, and optionally `dialect/scriptlets/`. The running
plugin serves the same files at the well-known `/gherkin-dialect` path, which
is how the authoring app loads the words of a deployed service. For offline
compilation the CLI's `sync-dialects.mjs` copies each plugin's folder into
`public/components/<id>/` of whichever app it is pointed at.

---

## 6. The meta-concepts: generations, dialects, governance

### Six shapes, and only six

The core language is deliberately small. It fixes the sentence shapes,
the lexical rules, the placeholders and the well-known references. A dialect
may add verbs, kinds, types and a conformance handler; it may not add a shape.
That is what lets an author read a feature in a dialect they have never seen,
and what lets the app, the CLI and the manager share one parser.

If a dialect needs a shape that does not exist, that is a core proposal, made
with the sentence as an author would write it, the `text:` entry, and the
compiled TDL for one example.

### Generations and versions

The core has a `specVersion` (`2.0.0` today). Any change to a step pattern
bumps it: minor for an addition, major for a changed or removed pattern.
A dialect has its own `language.version` and declares the core range it is
compatible with. A feature file declares what it was written for with
`@lang:` and `@dialect:` tags, and a mismatch is reported by name rather than
as a mysterious "no mapping for step".

Generation 1 wrote steps as regular expressions and used a different, less
regular vocabulary. It still compiles: a file tagged `@lang:itb-core-en@^1`
loads `lang/en-1.yml` and each dialect's `steps-v1.yml`. A converter script
in the compiler package rewrites v1 features to v2.

### The corpus is the contract

The compiler package carries a corpus: real feature files and the exact TDL
they compile to. Every change to the compiler or the core must reproduce
those snapshots byte for byte, or re-record them in a reviewed diff. A
snapshot diff is the observable effect of a language change; reviewing it is
how a change to one dialect is kept from silently altering another team's
tests.

### Compile time versus deploy time

The compiler checks what it can: unknown steps, missing tables and columns,
actors of the wrong kind, values without a type, version mismatches, missing
scriptlets. ITB checks the rest when a suite is deployed, and reports TDL
error codes. Section 7 lists the ones the compiler now catches for you.

### Style rules

These are the rules a reviewer applies to a new step, in the core or in a
dialect:

- One of the six shapes. Actions start with the actor; assertions with the
  `$value`; declarations with the actor and `is`.
- Every value a step needs is visible in the sentence. No step reads a
  variable another step happened to set.
- Every step that produces something binds it with `as $x`.
- A dialect verb that calls a service asserts the call succeeded; a raw HTTP
  step does not.
- Prefer a short qualifier over an option table when one option is the common
  case (`ignoring slicing errors`); use `with:` tables for the rest.
- Names an author types are words, not codes: `is a fhir-validator`, not
  `is kind "FV"`.

---

## 7. What the compiler checks for you

These rules come from ITB's own suite validator. Each one was first met as a
rejected deploy; each is now reported when you compile, with the line to fix.

| Rule | ITB code | What you see |
|---|---|---|
| Every test case needs a system under test | TDL-034 and conformance binding | error: "No system under test among the declared actors (…)"; warning when no actor is declared at all and `Client` is assumed |
| An interaction may only be addressed to a SUT actor | TDL-034 | warning: "<Actor> is not the system under test, so this interaction is shown to whoever runs the session"; the compiler drops the target |
| A variable written as `$name{key}` is a map | TDL-041 | handled: the compiler declares it as a map |
| No backslash escapes in TDL expressions | TDL-042 | error naming the expression; use single quotes inside a double-quoted literal |
| XPath `translate` takes three arguments | TDL-042 | error naming the call |

Warnings do not stop compilation. Errors do, and the manager and the CLI
refuse to deploy a feature that has any.

---

## 8. Where to go next

- The **Language Explorer** in the authoring app lists every loaded step,
  shows its documentation and pattern, and lets you paste a sentence to see
  which entry matches it.
- [REFERENCE.md](REFERENCE.md) has every step of the core and the bundled
  dialects with an example.
- [GRAMMAR.md](GRAMMAR.md) is the formal grammar and the dialect contract.
- `GOVERNANCE.md` in the compiler package describes how the community changes
  the language.
- The corpus features under `test/corpus/features` in the compiler package
  are complete, working examples: IPS consumer, creator and server; IHE MEOW
  client and server; MHD; terminology; certificates.
