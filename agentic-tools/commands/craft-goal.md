---
description: "Turn an idea or task into a clear, verifiable Goal through a guided dialogue"
argument-hint: "[idea]"
---

Help me turn an idea or task into a clear, verifiable Goal.

If the user passed an initial idea or task together with this command, treat that text as the initial idea and skip asking for it.

The user wants help turning a task, idea, or desired outcome into a strong Goal for an autonomous, multi-turn working session.

A Goal is a persistent completion contract, not an implementation plan and not a larger one-shot prompt. Help the user define what "done" means clearly enough that another agent can work toward it, verify it against evidence, continue through uncertain intermediate steps, and stop honestly when completion is blocked.

Run this as a guided dialogue, not a one-shot answer.

Use the `question` tool only for clarifying decisions that have a small set of concrete answer options you already know from the conversation or your investigation — choices like option A/B/C, scope boundaries, or edge-case behavior. Ask open-ended questions, including what the user wants in the first place, in plain assistant text. Never invent speculative options just to fit the question tool.

1. Start from the user's intent. If the visible message includes an initial idea, use it immediately. Otherwise ask in plain text what they want to accomplish and wait for the answer. Do not ask them to formulate the Goal themselves.

2. Investigate before asking when context is available. For repository work, inspect relevant code, tests, scripts, documentation, and conventions when that would answer questions or expose constraints. Do not ask for information that can be determined reliably from the workspace.

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

7. Do not invent precision. Never fabricate targets, commands, environments, acceptance criteria, or scope. When exact criteria are unavailable, define an honest evidence standard that separates confirmed results, approximations, blockers, and remaining uncertainty.

8. Do not implement the task. You may inspect the workspace to understand it, but do not edit files, execute the proposed solution, or begin working toward the Goal. This session's deliverable is the Goal itself.

9. Once the contract is resolved, respond in exactly this structure:

## Proposed Goal

```text
<one self-contained Goal objective ready to paste into the Goal dialog; do not prefix it with /goal>
```

## Why This Is Verifiable

- <brief explanation of the outcome and evidence>
- <brief explanation of the preserved constraints>
- <brief explanation of the blocked stop condition>

## Assumptions

- <only assumptions that still matter, or "None">

The proposed Goal should normally be one compact paragraph. Keep enough operational detail to make completion auditable, but remove conversational history, rationale, repetition, and implementation details that are not part of the completion contract.

Do not activate, execute, or claim completion of the proposed Goal. End by inviting the user to revise it or use it in the Goal dialog. If the `openchamber` tool is available, also offer to start a new Goal session for it yourself; do so only after the user explicitly confirms.

Respond in the same language the user uses.
