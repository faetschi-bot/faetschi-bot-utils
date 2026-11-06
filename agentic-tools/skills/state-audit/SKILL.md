---
name: state-audit
description: "Find the implicit state machines in an app and the bugs they cause: map how a flow moves, show which steps break, and explain or fix the findings on a later branch."
---

# State Audit

Find the states a feature moves through, then find the bugs where it moves
wrong.

Read the project's `AGENTS.md` first. Do not change code unless asked.

## What counts

A state machine is any value that decides what the app may do next: a status, a
combination of flags, a pending request, a job, a lock, a sync state, a signup
step.

Ignore framework lifecycles and dependency internals. They are boundaries, not
application machines.

## Find the machines

Look for:

- status enums and strings, and everything that writes them;
- flags that only make sense together, or nullable timestamps and error fields;
- requests that can be in flight, replaced, retried, or cancelled;
- jobs, queues, webhooks, leases, locks, schedulers;
- sync and offline, upload, multi-step forms, auth and session;
- data written to two places: memory and cache, cache and database, client and
  server.

For each machine, write down:

- its states, and which of them the code can really reach;
- the events that move it, and what guards each event;
- its rules, such as "one order is charged once", and where the state is
  written;
- the one place that should own the state.

Default scope is the whole repo, split by packages or app areas. Prefer five
machines traced fully over fifty listed.

## Find the bugs

For each step that can run twice, out of order, or after an `await`, ask:

- Can a late answer overwrite newer state? (search, save, upload, navigation)
- Can the same action run twice? (double click, retry, webhook redelivery)
- Can it fail halfway and leave a record half-written?
- Can a step get stuck with no way out?
- Can two tabs, workers, or requests do it at the same time?
- Can a timer or clock change the outcome?
- Does permission change while the action is in flight?
- Can two machines write the same record and disagree?

Then check the boring protections before calling it a bug: disabled button,
unique constraint, transaction, idempotency key, request token, route auth.

## Prove it

A bug needs a sequence a real user or service can trigger:

`start state → event → … → wrong state`

1. Write the sequence.
2. Find the real entry point: UI event, route, worker, or another service. A
   test harness calling methods in an order no caller produces does not count.
3. Trace it in the code and note `file:line` at each step.
4. Try to reproduce it with a test or a live repro. If you cannot, say so.
5. Try to disprove it. If it needs an interleaving no real caller can produce,
   drop it.

Mark each finding `reproduced`, `traced in code`, or `unproven`.

## Report

Put bugs first, then the machine list, then what you did not cover.

Every bug must name its machine. Group triggers of one root cause under one bug.
Leave out defects that are not caused by state.

For each bug:

- an id and the machine it belongs to (`F1`, `M1`);
- how bad it is, and the rule it breaks;
- the sequence, and what actually happens;
- `file:line` evidence;
- the smallest fix, not applied;
- `reproduced`, `traced in code`, or `unproven`.

For each machine: states, events, owner, where it is written.

Coverage: what you read, what you skipped, what you assumed. Do not say "all
state machines"; say what you covered.

## Save and explain later

Save the report where the user asks, or to `.state-audit/<scope>.md`. This is
the only write allowed in a read-only audit. Include the branch and commit.

When asked to explain a past audit, read that file. Name the machine, its
states, then the bug's sequence.

When asked for fixes, read the current code on the named branch first. Line
numbers and findings move. Say which bugs still exist, then give one fix and one
check per bug. Do not re-audit the whole repo for a follow-up.
