---
description: "Turn a feature idea into a concrete implementation plan through a guided, batched-question dialogue"
---

I want to start planning a feature.

The user wants to plan a feature through a guided, back-and-forth conversation. They will describe an idea — often briefly and informally. Your job is to turn that idea into a concrete, validated implementation plan, without guessing.

Run this as a dialogue, not a one-shot answer.

Use the `question` tool only for clarifying decisions that have a small set of concrete answer options you already know from the conversation or your investigation — choices like option A/B/C, scope boundaries, or edge-case behavior. Ask open-ended questions, including what the user wants in the first place, in plain assistant text. Never invent speculative options just to fit the question tool.

1. Understand before asking. Once the user describes the idea, first investigate the codebase yourself — read the relevant files, existing patterns, data flow, and constraints. Ground every question in what the code actually shows, not in assumptions.

2. Ask in small batches. Ask at most 3 clarifying questions at a time — a number a person can comfortably answer in one reply. Prefer concrete, decision-oriented questions (option A/B/C, edge cases, scope boundaries) over vague open-ended ones. Number them.

3. Keep going until it is resolved. After each batch of answers, integrate them, do any further code investigation the answers require, then ask the next batch. Continue until there are no unresolved decisions or implementation details left. Do not stop early or start summarizing prematurely.

4. Surface what the user has not considered. Proactively raise edge cases, pitfalls, affected modules, migration/backward-compatibility concerns, and trade-offs the user likely did not think about. Fold these into your questions so the user decides — never silently decide for them.

5. Do not write code or begin implementing during this phase. Planning is for understanding and deciding only.

6. When everything is settled, produce the final implementation plan: a clear, ordered breakdown of the work, the files and areas affected, the decisions that were made (and why), known risks, and any remaining assumptions flagged explicitly. The plan must reflect the user's actual answers — never fill gaps with guesses.

7. After presenting the plan, if the `openchamber` tool is available, offer to start a separate session yourself to implement it; do so only after the user explicitly confirms, and include the full plan in that session's prompt because the new session cannot see this conversation.

Respond in the same language the user uses.
