# FHIR Gherkin Dialect -- Formal Grammar

EBNF-like grammar for the FHIR Gherkin Dialect core language and the FHIR Validator extension.

---

## Lexical Conventions

- Whitespace between tokens is normalized: multiple spaces collapse to a single space.
- Content inside double quotes (`"..."`) is preserved as-is, including internal whitespace.
- Steps are matched after stripping the Gherkin keyword (`Given`, `When`, `Then`, `And`, `But`).
- A trailing `:` indicates that a docstring or data table follows on subsequent lines.

## Feature tags

Tags precede `Feature:` and are collected feature-wide (there is no
per-scenario scoping — a tag anywhere in the file applies to the whole file).
They are lowercased when read, so ids compare case-insensitively.

### Behaviour

| Tag | Effect |
|---|---|
| `@continue-on-error`, `@non-blocking` | emits `<steps stopOnError="false">`; checks still report red and still fail the test, they just don't abort the remaining steps |

### Language and dialect requirements

A file may declare which language spec and which plugin dialects it was written
against. These are optional — a file with no such tags behaves exactly as before.

```gherkin
@lang:itb-core-en@^1.4
@dialect:fhir-validator@^1.2
Feature: Patient profile validation
```

```ebnf
LangTag     = "@lang:" , SpecId , [ "@" , Range ] ;
DialectTag  = "@dialect:" , ComponentId , [ "@" , Range ] ;
Range       = [ "^" | "~" | ">=" | "<=" | ">" | "<" | "=" ] , Version ;
Version     = [ "v" ] , Digit+ , [ "." , Digit+ ] , [ "." , Digit+ ] ;
```

Ranges use the same matcher as a component manifest's `language.baseVersion`:

| Range | Matches |
|---|---|
| `^1.4` | `1.4.0` up to, but not including, `2.0.0` |
| `~1.4` | `1.4.x` only |
| `1.4.2` | exactly `1.4.2` |
| `1.4` | exactly `1.4.0` — missing parts default to zero, **not** "any 1.4.x" |
| `>=1.4` | `1.4.0` or newer, any major |
| *(omitted)* | any version; the tag then only names a requirement |

**One comparator per tag.** The matcher ANDs space-separated parts, but a
Gherkin tag cannot contain a space, so two-sided ranges such as `>=1.3 <1.6`
cannot be written as a tag. `^` and `~` cover the realistic cases.

A declaration that is not satisfied produces a **warning**, never an error: the
file may still compile, and any step that genuinely failed to match already
reports itself. The warning exists to explain *why* those errors are there —
for example `This file targets fhir-validator ^1.2 — 2.0.1 is loaded — 12 steps
unmatched`.

## Terminals

```ebnf
Actor       = Letter , { Letter | Digit | "_" } ;
Variable    = ( Letter | "_" ) , { Letter | Digit | "_" } ;
Value       = '"' , { any-char - '"' } , '"' ;
URL         = '"' , ( "http://" | "https://" ) , { url-char } , '"' ;
Path        = '"' , { any-char - '"' } , '"' ;
JsonPointer = '"' , "/" , { any-char - '"' } , '"' ;
Number      = Digit , { Digit } ;
Package     = { any-char - '"' } ;
DocString   = '"""' , NEWLINE , { any-line } , '"""' ;
DataTable   = ( "|" , { CellValue , "|" } , NEWLINE )+ ;

Letter      = "A".."Z" | "a".."z" ;
Digit       = "0".."9" ;
```

---

## 1. Actors

```ebnf
actor-sut         = Actor , "is the system under test"
                    , [ ( "on" | "at" ) , URL ]
                    , [ "as defined by" , URL ] ;

actor-available   = Actor , "is available"
                    , [ "as" , Value ]
                    , [ ( "on" | "at" ) , URL ]
                    , [ "as defined by" , URL ] ;

actor-infra       = Actor , "is infrastructure"
                    , [ ( "on" | "at" ) , URL ]
                    , [ "as defined by" , URL ] ;
```

**Constraints:** `as "<name>"` is mutually exclusive with endpoint/canonical options.

### Actor roles

Each actor declaration carries a *role* that flows into the compiled TDL and downstream tools:

| Phrase | Role |
|---|---|
| `is the system under test` | `SUT` (matches GITB's reserved word) |
| `is available` | `infra` (default for non-SUT support actors) |
| `is infrastructure` | `infra` (explicit alias) |

A scenario MAY declare multiple `SUT` actors (peer-to-peer testing — e.g. a sender and a receiver where both are real systems being measured).

In the emitted TDL, `SUT` becomes GITB's `role="SUT"` on the testcase-level actor reference; `infra` becomes `role="SIMULATED"`. The testsuite-level `<gitb:actor>` block does not carry a role attribute (XSD constraint). A `calibration` role is planned but deferred until ITB can carry the distinction natively.

## 2. HTTP Requests

```ebnf
http-post = Actor , "posts to" , Actor , "at" , Path , "with:" , DocString ;

http-get  = Actor , "gets" , Value , "as" , Value ;
```

## 3. Variables

```ebnf
set-value     = "set" , Value , "to" , Value ;

set-docstring = "set" , Value , "to:" , DocString ;

extract-from  = "extract" , JsonPointer , "from" , Value , "as" , Value ;

extract-last  = "extract" , JsonPointer , "as" , Value ;
```

## 4. Assertions

```ebnf
assert-equal    = Value , "should be" , Value ;

assert-contains = Value , "should contain" , Value ;

assert-notempty = Value , "should not be empty" ;
```

### Reserved Names

When `Value` in the left-hand position resolves to one of these strings, it maps to an internal variable:

```
"response status"      -> $lastRequest{response}{status}
"response"             -> $lastRequest{response}{body}
"validation errors"    -> $validationErrors
"validation warnings"  -> $validationWarnings
"validation outcome"   -> $validationOutcome
"validation severity"  -> $validationSeverity
```

All other values resolve via the `$<name>` variable lookup (`$$1` in the pattern).

## 5. Interaction

```ebnf
inform      = Actor , "is informed" , Value , [ "with" , Value ] ;

ask-input   = Actor , "is asked for" , Value , [ "with" , Value ] ;
```

## 6. Logging

```ebnf
log-step = "log" , Value ;
```

---

## FHIR Validator Extension

### Package Loading

```ebnf
load-package = Actor , "is loaded with package" , Value ;
```

### Validation

```ebnf
validate = "validate" , Value , "against" , Value
           , [ "with best practice" , Value
             | "with resource id" , Value ] ;

validation-pass = "the validation should pass" ;

validation-fail = "the validation should fail" ;
```

**Outputs:** `$validationOutcome`, `$validationErrors`, `$validationWarnings`, `$validationSeverity`.

### FHIRPath Evaluation

```ebnf
fhirpath-expect    = "evaluate FHIRPath" , Value
                     , [ "on" , Value ]
                     , "and expect" , Value ;

fhirpath-as        = "evaluate FHIRPath" , Value
                     , "on" , Value
                     , "as" , Value ;

fhirpath-exists    = "evaluate FHIRPath" , Value , "exists" ;

fhirpath-count     = "evaluate FHIRPath" , Value , "count is" , Number ;
```

**Note:** `fhirpath-expect` without `on` and `fhirpath-exists`/`fhirpath-count` operate on `$submitResult{payload}` (the last submitted resource).

### Matchetype Comparison

```ebnf
partial-match = "partially match" , Value , "against:" , DocString ;

exact-match   = "exactly match" , Value , "against:" , DocString ;

not-match     = Value , "should NOT match:" , DocString ;
```

### Test Data Generation

```ebnf
generate-data = "generate test data from profile" , Value
                , [ "as" , Value ] ;
```

**Output:** `$generatedResource` (default) or the named variable.

### Data/Mapping Definitions

```ebnf
define-mappings       = "define mappings" , Value , ":" , DataTable ;
                        (* table columns: path, expression *)

define-mappings-parts = "define mappings" , Value , "with parts:" , DataTable ;
                        (* table columns: path, part, expression *)

define-data           = "define data" , Value , ":" , DataTable ;
                        (* table columns: arbitrary *)
```
