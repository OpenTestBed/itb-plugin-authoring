# OTB Gherkin — Formal Grammar (generation 2)

The core language (`itb-core-en`, specVersion 2.x) and the contract every
dialect extends it through. Feature files written against generation 1 keep
compiling: tag them `@lang:itb-core-en@^1` and the compiler loads `lang/en-1.yml`
and each dialect's `steps-v1.yml` instead.

---

## Lexical conventions

- Steps are matched after the Gherkin keyword (`Given`, `When`, `Then`, `And`, `But`).
- Whitespace between tokens collapses to a single space; text inside `"…"` is kept as is.
- A trailing `:` means a doc string or a data table follows.
- Matching is case-insensitive for keywords; identifiers keep their case.

```ebnf
Actor       = UpperLetter , { Letter | Digit | "_" } ;              (* FHIRValidator *)
Var         = "$" , Ident ;                                          (* $bundle — a binding target *)
Ref         = "$" , Ident , { "." , Segment } ;                      (* $bundle, $response.status, $received.headers.Accept *)
Literal     = '"' , { any-char - '"' } , '"' ;
Number      = [ "-" ] , Digit+ , [ "." , Digit+ ] ;
Bool        = "true" | "false" ;
Value       = Literal | Ref | Number | Bool ;                        (* numbers and booleans need no quotes *)
Kind        = LowerLetter , { LowerLetter | Digit | "-" } ;          (* fhir-validator *)
Path        = Literal ;   (* "/json/pointer" on any value; otherwise the value type's language *)
Canonical   = Literal ;
DocString   = '"""' , NEWLINE , { any-line } , '"""' ;
DataTable   = ( "|" , { Cell , "|" } , NEWLINE )+ ;                 (* first row is the header *)
Ident       = ( Letter | "_" ) , { Letter | Digit | "_" } ;
Segment     = { Letter | Digit | "_" | "-" }+ ;
```

### Well-known references

| Reference | Meaning |
|---|---|
| `$response.status` `$response.body` `$response.headers` | the last HTTP response (`$response` alone is the body) |
| `$received.method` `$received.path` `$received.headers.<Name>` `$received.body` | the last request ITB received as a peer |
| `$validation.errors` `.warnings` `.severity` `.outcome` | the last validation |
| `$a.b.c` (anything else) | the map path `$a{b}{c}` |

### Tags

```gherkin
@lang:itb-core-en@^2 @dialect:fhir-validator@^2 @continue-on-error
```

| Tag | Effect |
|---|---|
| `@lang:<id>@<range>` | which core generation the file was written for; `^1` loads the previous language |
| `@dialect:<id>@<range>` | a dialect the file needs; a mismatch is reported by name |
| `@continue-on-error` | `<steps stopOnError="false">`: failed checks go red but do not abort |

---

## The six sentence shapes

Every step in the core and in every dialect is one of these.

### 1. Declaration

```ebnf
declare-sut   = Actor , "is the system under test" , [ "at" , Literal ] , [ "as defined by" , Canonical ] ;
declare-infra = Actor , ( "is infrastructure" | "is available" [ "as" , Literal ] ) , [ "at" , Literal ] , [ "as defined by" , Canonical ] ;
declare-kind  = Actor , ( "is a" | "is an" ) , Kind , [ "at" , Literal ] , [ "as defined by" , Canonical ] ;
data-pool     = Actor , "is configured with data pool" , Literal ;
```

Roles: the SUT compiles to `role="SUT"`, everything else to `role="SIMULATED"`.
The **kind** is a component id. It tells the compiler which dialect's steps
the actor serves, so a step can name it (`on FHIRValidator`) or leave it out
when only one actor of that kind is declared. An actor whose endpoint is
given gets `$<Actor>Base`.

### 2. Action

```ebnf
action = Actor , Verb , [ Value | Ref ] , [ ( "on" | "to" | "from" | "using" ) , Actor ] , { Qualifier } , [ "as" , Var ] , [ ":" ] ;
```

Verbs come from the core (HTTP, exchanges, interaction) and from dialects.
Rules the core imposes on every verb:

- the target actor is introduced by `on` (a service) or `to`/`from` (a peer);
- a result is bound with `as $x`, never left in a hidden variable;
- a dialect verb that calls a service asserts the call succeeded; a raw HTTP
  step does not, because there the status is what is under test.

Core actions:

```ebnf
http-post   = Actor , "posts" , ("to"|"on") , Actor , "at" , Literal , [ "with id" , Value ] , ( "with body" , Ref | "with:" DocString ) ;
http-put    = Actor , "puts"  , ("to"|"on") , Actor , "at" , Literal , [ "with id" , Value ] , ( "with body" , Ref | "with:" DocString ) ;
http-patch  = Actor , "patches" , ("to"|"on") , Actor , "at" , Literal , [ "with id" , Value ] , ( "with body" , Ref | "with:" DocString ) ;
http-delete = Actor , "deletes" , ("on"|"from") , Actor , "at" , Literal , [ "with id" , Value ] ;
http-get    = Actor , "gets from" , Actor , "at" , Literal , [ "with id" , Value ] , "as" , Var
            | Actor , "gets" , Literal , "as" , Var ;
http-loop   = Actor , "posts" , Ref , "to" , Actor , "at" , Literal , Value , "times, paced manually" ;
header      = "set header" , Literal , "to" , Value ;
bearer      = "set bearer token from" , Ref ;
wait-for    = Actor , "waits for" , Actor , [ "within" , Number , "seconds" ] ;
listen      = Actor , "is listening for" , Actor ;
receive     = Actor , "receives a request from" , Actor , [ "within" , Number , "seconds" ] ;
reply       = Actor , "replies to" , Actor , "with status" , Number , ( "and body" , Ref | "and:" DocString ) ;
unlisten    = Actor , "stops listening for" , Actor ;
wait        = "wait" , Value , "seconds" ;
scriptlet   = "call scriptlet" , Literal , [ "as" , Var ] , [ "with:" , DataTable , [ DocString ] ] ;
log         = "log" , Value ;
```

### 3. Assertion

```ebnf
assert = Ref , [ "at" , Path ] , "should" , [ "not" ] , Comparator ;
Comparator = "be" , Value | "contain" , Value | "be empty" | "exist"
           | "match" , Literal | "be one of" , Literal
           | "be at least" , Value | "be at most" , Value | "be greater than" , Value | "be less than" , Value
           | "equal" , Value , "minus" , Value ;
```

`at Path` evaluates the path first: a path starting with `/` is a JSON
pointer on any value; any other path is handed to the value's **type** (FHIRPath
for a FHIR resource, a model query for an ArchiMate model). A value gets its
type from the step that bound it, from `$x is a <type name>`, or — when
exactly one path-capable validator is declared — by default.

`$response.status should be N` is guarded: an empty status counts as `0`.

### 4. Conformance

```ebnf
conform = Ref , "should" , [ "not" ] , "conform to" , Canonical , [ "on" , Actor ]
        , [ "ignoring slicing errors" | "ignoring errors matching" , Literal | "with:" , DataTable ] ;
```

Dispatched to a dialect's conformance handler: the named actor's, else the
one owning the value's type, else the only declared actor whose dialect can
check conformance. The handler leaves the number of counted errors in
`$conformanceErrors`; the core asserts it (`0`, or `> 0` for `not`).

### 5. Binding

```ebnf
set      = "set" , Var , "to" , ( Value | "now" , [ "with format" , Literal ] | ":" , DocString ) ;
extract  = "extract" , Path , [ "from" , Ref ] , "as" , Var ;      (* no `from`: the last response body, pointer only *)
typing   = Ref , ( "is a" | "is an" ) , TypeName ;                 (* compile-time; names come from the loaded dialects *)
```

### 6. Interaction

```ebnf
inform = Actor , "is informed" , Literal , [ "with" , Value ] ;
ask    = Actor , "is asked for" , Var , [ "with" , Literal ] ;
upload = Actor , "uploads a file as" , Var ;
```

---

## Writing a step definition (core or dialect)

Entries are typed **text**, not regex. The text compiles to the regex the
engine has always run; the placeholders give each capture a type.

```yaml
verbs:
  - text: '{actor} loads IG {string}( on {actor:fhir-validator})?'
    doc: Load an IG package on the validator.
    actions: [...]
```

```ebnf
Placeholder = "{actor}" | "{actor:" Kind "}" | "{var}" | "{ref}" | "{value}"
            | "{string}" | "{path}" | "{url}" | "{canonical}" | "{int}" | "{word}" | "{kind}" | "{type}" ;
Optional    = "(" , text-with-placeholders , ")?" ;
Alternative = Word , "/" , Word , { "/" , Word } ;
```

| Placeholder | Matches | `$N` in a template gives |
|---|---|---|
| `{actor}` | `PascalCase` | the actor id |
| `{actor:kind}` | an actor declared `is a <kind>` (checked; filled in when omitted and unique) | the actor id |
| `{var}` | `$name` | `name` |
| `{ref}` | `$name`, `$a.b.c` | the TDL reference (`$name`, `$lastRequest{response}{status}`) |
| `{value}` | `"lit"`, `$ref`, `42`, `true` | a TDL expression (`"lit"`, `$ref`, `"42"`, `"true"`) |
| `{string}` `{path}` `{url}` `{canonical}` | `"…"` | the text between the quotes |
| `{int}` `{word}` `{kind}` | digits / a word / a component id | the text |
| `{type}` | a registered value type name | the type key |

Also available in templates: `$N.raw` (the captured text), `$$N` (`$` + text),
`$opt.<name>` (a `| option | value |` table row), `$docString`, `$row.<col>`
inside `foreach`, and what the parser binds: `$target` / `$targetBase` (the
resolved dialect actor), `$subject` / `$path` / `$pathVar` / `$pathValue`
(path dispatch), `$profile` / `$ignore` (conformance dispatch), plus any
`bind:` names. An action may carry `when: '$3'` / `unless: '$3'` to run only
when the guard is (not) empty.

### What a dialect file contributes

```yaml
id: fhir-validator
language: 2
kinds: [fhir-validator]                 # actor kinds → "X is a fhir-validator at …"
types:
  fhir:Resource:
    name: FHIR resource                 # "$x is a FHIR resource"
    path: { kind: …, actions: [...] }   # $subject at $path → $pathVar
conforms:
  kind: …                               # which of the kinds checks conformance
  actions: [...]                        # $subject, $profile, $ignore, $opt.* → $conformanceErrors
verbs:
  - text: '…'                           # sentence shapes 2, 3, 5, 6 only
    output: { type: fhir:Resource }     # type of the last {var} capture
    actions: [...]
```

A dialect never adds a sentence shape. Two dialects may define the same verb
text with different `{actor:kind}` targets; the declared kinds decide which
one serves a line.

---

## Escaping to raw ITB

`call scriptlet "id" [as $x] [with: table] ["""body"""]` resolves
`scriptlets/id.xml` through the `# itb:` header locations, then `scriptlets/`
beside the features, then the enabled components. An id that resolves nowhere
is an error; a doc string supplies the body inline, verbatim.

```gherkin
# itb:
#   scriptlets:
#     - ./shared-scriptlets
Feature: …
```
