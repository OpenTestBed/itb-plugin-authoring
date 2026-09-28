# Dialect reference

Read alongside `SKILL.md`. Everything here was read out of the compiler in
`itb-cli/packages/gherkin/src`. The `CatalogAction` type in `languageCatalog.ts`
is stale and missing several fields the dispatcher accepts; `IRAction` in
`gherkinParser.ts` is the accurate one. This file follows the dispatcher.

## The action vocabulary

Everything the compiler understands inside a verb's `actions:` list. Anything
else is **silently dropped with no error**, so a misspelled key such as `asign:`
produces nothing at all.

| Action | Required fields | Optional | Emits |
|---|---|---|---|
| `send` | `handler`, `inputs` | `id`, `desc`, `from`, `to`, `txnId` | `<send>` with an `<input>` per entry. `from` defaults to the first SUT actor. `id: 'lastRequest'` is the convention that makes `$response.*` work |
| `receive` | `handler` | `id`, `desc`, `from`, `to`, `txnId`, `inputs` | `<receive>` |
| `process` | `handler`, `operation` | `output`, `inputs`, `from`, `to`, `hidden` | `<process>` |
| `verify` | `handler`, `inputs` | `desc` | `<verify>` — this is what produces a pass or fail |
| `assign` | `to`, `value` | `append`, `type` | `<assign>`. A value of `[]` or `''` drops the step entirely |
| `listAppend` | `list`, `item` | — | `<assign append="true">` holding the JSON |
| `call` | `path` | `output`, `inputs`, `from`, `to`, `inputsFromTable`, `body` | `<call>`. `output` makes the variable a **map**, so read fields as `$x{field}` |
| `declareVariable` | `name` | `varType` (default `string`), `value` | a `<var>` in `<variables>`, no step |
| `declareActor` | `id` | `name`, `role`, `endpoint`, `canonical`, `kind` | an `<actor>` entry, no step. `role: SUT` or `infra` |
| `interact` | — | `id`, `desc`, `title`, `inputTitle`, `with`, `instructions[]`, `requests[]`, `requestsFromTable` | `<interact>`. `with` is dropped unless it names a **SUT** actor (TDL-034) |
| `foreach` | `do` | `from` | Compile-time unrolling over the step's table. Emits no loop. `from` is decorative and never read |
| `repeat` | `count`, `do` | — | `<while>` with an `i` counter. The body accepts **only** `send`, `call`, `wait`, `assign`, `log`; anything else is silently dropped |
| `wait` | `durationMs` | — | a `<log>` line only. The TDL schema has no sleep |
| `btxn` | `txnId`, `from`, `to`, `handler` | — | `<btxn>` |
| `etxn` | `txnId` | — | `<etxn>` |
| `log` | a string, or `{ value }` | — | `<log>` |

Any action may carry `when: '$3'` and runs only when that substitutes to
something non-empty. **`unless:` is not implemented** — an action carrying it is
always emitted. Invert the condition and use `when:`.

## Slot substitution

Placeholders are numbered by their order in `text:`, **including placeholders
inside optional `( ... )?` groups**. An omitted optional slot substitutes to an
empty string, and a run of trailing `, <omitted>` before a closing paren is
removed, so `concat($Base, "/p", $4)` becomes `concat($Base, "/p")`.

| Form | Expands to |
|---|---|
| `$N` | the slot's **TDL expression**. `{string}` loses its quotes; `{value}` keeps them; `{ref}` resolves through the core's well-known references |
| `$N.raw` | the captured text with quotes and any leading `$` stripped |
| `$$N` | a literal `$` prepended to the raw text — for naming a variable (`$$2Base`) or writing `$bundle` into a `desc` |
| `$docString` | the triple-quoted block, raw. Substituted first |
| `$opt.<name>` | the `value` column of the `| option | value |` row named `<name>`; empty if absent |
| `$row.<col>` | the current table row's column. `$row.__index` is the 1-based row number |
| `$target` | the resolved actor **id**. Auto-bound only for a dialect verb whose actions literally contain the string `$target` |
| `$targetBase` | `$<ActorId>Base`, the variable holding the `at "http://..."` endpoint. **Empty if the actor was declared without `at`** |
| `$subject`, `$path`, `$pathVar`, `$pathValue`, `$profile` | available inside `types.*.path.actions` and `conforms.actions` only |
| any `bind:` name | whatever you bound it to |

Because `{string}`'s `$N` is unquoted, a template that wants a string literal
must quote it: `value: '"$2"'`. Conversely `{value}` carries its own quoting, so
never wrap it.

One surprise worth knowing: if the whole substituted result looks like
`"$name"`, the quotes are stripped and it becomes a variable reference. That is
deliberate, and it is why `value: '"$2"'` yields a reference when the author
wrote `$x` and a literal when they wrote `"200"`.

## Placeholder types and what they accept

| Placeholder | Matches |
|---|---|
| `{actor}` | `[A-Za-z][A-Za-z0-9_]*` |
| `{actor:<kind>}` | the same, but the actor must be declared as that kind, or the entry is skipped so another dialect can serve the line |
| `{var}` | `$name` |
| `{ref}` | `$name` or `$a.b.c` |
| `{value}` | a quoted string, a `$ref`, a number, or `true`/`false` |
| `{string}` `{path}` `{url}` `{canonical}` | `"..."` — **identical regexes**; the type only chooses the dispatch branch. A value containing a double quote cannot be matched |
| `{int}` | digits |
| `{word}` | `[A-Za-z][A-Za-z0-9_-]*` |
| `{kind}` | `[a-z][a-z0-9-]*` |
| `{type}` | the display names of all loaded value types |

`a/b` alternation applies to a whole token only, so `posts to/on` works.
`( ... )?` is recognised only when `)` is immediately followed by `?`. Matching
is case-insensitive and runs of whitespace collapse, except inside quotes.

## Variable typing

Types are inferred positionally and the **first writer wins**:

- `process output` → string
- `call output` → **map** (read fields as `$x{field}`)
- `send` / `receive` `id` → map
- `assign to: 'x{y}'` → `x` is a map
- `assign append` → list of map
- plain `assign` → string
- an `interact` request variable → string, or map if the name contains `{`
- anything referenced but never written → string

So an `assign to: 'x'` placed before a `process output: 'x'` leaves `x` a
string, and the process then fails at run time. Order matters.

Never declare or reuse: `i`, `row`, `tableRows`, `docString`, `iterator`,
`lastRequest`, `lastReceived`, `lastReply`, `conformanceErrors`,
`validationErrors`, `validationWarnings`, `validationOutcome`,
`validationSeverity`, `<Actor>Base`, or anything named `docTpl*`.

## Tables and doc strings

A step may take both; the table comes first. `table: { required: [a, b] }` makes
the table mandatory and checks the header names. A table with only a header row
counts as **no table** and fails that check.

Any row with an `option` column feeds `$opt.*`, so do not use `option` as a data
column name for anything else.

One trap: if a `send` action's `inputs.body` starts with `{` and contains `$vars`
after substitution, the compiler rewrites it behind your back into a FreeMarker
template with `?json_string` escaping. If you want control of the templating, do
not hand a brace-shaped literal with variables to `send.inputs.body` — build it
yourself with an explicit `TemplateProcessor` step, as the shipped dialects do.

## YAML conveniences

Top-level keys starting with `x-` are deleted after parsing, which is how the
shipped dialects define reusable anchors (`x-json: &json`). The prefix means
nothing else, and a nested `x-` key is not removed.

Anchors and aliases are resolved by the YAML parser before the compiler sees
anything. A `- *anchor` whose anchor is a list of actions is spliced in place,
but only inside `verbs[].actions`, `types.*.path.actions` and
`conforms.actions`. An aliased list anywhere else is left as a nested array and
will not work.

## Scriptlets

Put the XML in `dialect/scriptlets/<file>.xml`, list the **filename only** in
`component.yml` under `scriptlets:`, and call it with
`call: { path: 'scriptlets/<file>.xml', ... }`. The component folder is dropped
from the stored path, so the `scriptlets/` prefix is what you reference.

Declare your scriptlet's `<params><var name type="..."/>` accurately. The
compiler reads them and retypes the caller's variable to match, because ITB does
no implicit conversion at a call boundary.

Every scriptlet of every enabled component is copied into the output suite,
whether or not a step referenced it.

## Things the docs promise that do not exist

| Claimed | Reality |
|---|---|
| `unless:` guards an action | True from 0.3.5. On an earlier compiler it was documented but unimplemented, so the action always emitted |
| `listen` is an action | No such action |
| `foreach` emits `<foreach>` | Compile-time unrolling; emits nothing |
| `repeat` emits `<repeat>` | Emits `<while>` |
| `component.yml` `services:` declares handlers | Read by nothing |
| A dialect may add `refs:` or `pathEvaluators:` | Neither is merged. Only `types.*.path` works |
| `language:` may be omitted from `component.yml` | True for remote dialects only. A local one then loads no steps |
| `requires:` on a verb | Warns on every compile, because the CLI never populates the service list. Avoid |
