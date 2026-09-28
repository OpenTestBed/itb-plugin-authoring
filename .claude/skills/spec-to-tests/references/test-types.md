# Kinds of test, and what each is for

Use this at stage 2. Offer the list to the user, say what each buys and what it
costs, and get an explicit answer. The point is that the omissions become
deliberate.

Ordered roughly by how often they earn their place.

## Positive paths

The system does what the spec says when given what the spec expects. Always in
scope unless the user says otherwise.

Cheap to write, cheap to run, and the weakest evidence of the lot. A system can
pass every positive test and still accept things it must refuse. Never present
a positive-only suite as a conformance claim.

## Negative paths

The cases a conformant system must **reject**: a missing required element, a
code outside the bound value set, a cardinality violation, a wrong status
transition, a forbidden update to an immutable field.

This is where real defects surface, and it is the kind most often skipped. Ask
for it explicitly. A negative test needs a clear expectation for what rejection
looks like — a status code, an OperationOutcome with a particular severity —
otherwise it passes on any failure at all, including the system being down.

## Boundary and cardinality

Zero, one, many, and one past the limit. The empty list where one element is
required. The repeated element where only one is allowed. The maximum length.

Worth it wherever the spec states a bound, because a stated bound that is never
tested is a comment.

## Required-element coverage

For each element the spec obliges an actor to populate or to process, a test
that it is there and is what it should be. This is the systematic counterpart
to the positive paths, and it is what makes a suite auditable against the spec.

If the spec carries machine-readable obligations, derive these rather than
hand-listing them. The `spec-to-test-ig` skill has that pipeline.

## Error handling

What the system does when something goes wrong that is not the client's fault:
an unavailable dependency, a malformed upstream response, a timeout. Distinct
from negative paths, which are about valid rejection of invalid input.

Often out of scope for a first round. Say so rather than silently omitting it.

## Idempotency and repetition

Send the same request twice. A system that is meant to be idempotent must not
change anything the second time, and must not fail. Cheap to add when you
already have the positive case, and it catches a specific and common class of
bug.

## Sequences and workflow

Several interactions in order, where the state after one determines what the
next may do. Create then update then read back. Order then fulfil then report.

More expensive to write and much more expensive to debug, because a failure
halfway through leaves state behind. Worth it where the spec describes a
workflow rather than a set of operations.

## Multi-party exchanges

The test bed stands in for a peer and answers the system's own requests, rather
than only sending to it. Needed whenever the system under test is a client of
something, not just a server.

The language supports this directly. It is the only way to test a system that
initiates rather than responds, and such behaviour is often the half of a spec
that no one tests.

## Operator-attested

For requirements about what a system **shows** or **does** that no request can
settle: a display, a warning, a physical action, a consent dialog. The operator
is asked and their answer is the evidence.

Ask for this whenever the spec has requirements about presentation. The
alternative is not a cheaper test, it is an untested requirement.

## Security and authorisation

That protected operations refuse an unauthenticated or under-scoped caller.
Almost always out of scope for a conformance suite about content, and almost
always assumed to be covered elsewhere. Confirm which.

## Performance and volume

How the system behaves under load, or with a large instance. Different tooling,
different skill. Mention it only to place it explicitly out of scope.

---

## A useful question to close on

Ask the user: *"If this suite goes all green, what would you still not know
about the system?"*

The answer is the list of what to add next, in their own words, and it belongs
in the README beside the tests.
