---
description: "Turn an idea or task into a clear, verifiable Goal through a guided dialogue"
argument-hint: "[idea]"
---

Help me turn an idea or task into a clear, verifiable Goal.

The user wants help turning a task or idea into a Goal for an autonomous, multi-turn session.

A Goal is a persistent completion contract, not an implementation plan. Define what "done" means so another agent can work toward it, verify it, and stop honestly when blocked.

Use the `question` tool, if available, only for concrete A/B/C choices; ask everything else in plain text.

1. Start from the user's intent. If the visible message includes an initial idea, use it immediately. Otherwise ask in plain text what they want to accomplish and wait for the answer. Do not ask them to formulate the Goal themselves.

2. Inspect only the code, tests, or docs needed to answer a question or expose a constraint; never ask what the workspace shows.

3. Decide whether a Goal is appropriate. Goals fit work with a durable objective, an evidence-based finish line, and an uncertain or iterative path. If this is a one-off edit, simple explanation, or obvious single step, explain briefly that a normal prompt is likely better. Continue crafting a Goal if the user still wants one.

4. Resolve the Goal contract:
- Outcome: what must be true when the work is complete.
- Verification surface: which tests, benchmarks, commands, artifacts, source material, observations, or other evidence prove completion.
- Constraints: what behavior, quality, compatibility, safety, performance, or scope must remain intact.
- Boundaries: which files, systems, tools, data, repositories, environments, or resources may or may not be used.
- Iteration policy: how the working agent should evaluate evidence and choose the next useful action after each attempt.
- Blocked stop condition: when it should stop, what evidence and attempted paths it should report, and what input would unlock progress.

5. Ask only necessary questions, in batches of at most 3. Prefer concrete, decision-oriented questions. Distinguish facts found in the workspace from decisions only the user can make.

6. Do not over-prescribe the path. Define the destination, evidence standard, and operating constraints while leaving the working agent room to choose its next action from what it learns.

7. Never fabricate targets, commands, or acceptance criteria; separate confirmed results from approximations and blockers.

8. Do not implement the task. You may inspect the workspace to understand it, but do not edit files, execute the proposed solution, or begin working toward the Goal. This session's deliverable is the Goal itself.

9. Once the contract is resolved, respond in exactly this structure:

## Proposed Goal

```text
<one self-contained Goal objective>
```

## Why This Is Verifiable

- <brief explanation of the outcome and evidence>
- <brief explanation of the preserved constraints>
- <brief explanation of the blocked stop condition>

## Assumptions

- <only assumptions that still matter, or "None">

Keep the Goal to one compact paragraph with enough detail to audit completion.

Do not execute or claim completion. Invite the user to revise it.

Respond in the same language the user uses.
