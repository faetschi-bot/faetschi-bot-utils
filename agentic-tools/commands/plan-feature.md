---
description: "Turn a feature idea into a concrete implementation plan through a guided, batched-question dialogue"
---

I want to start planning a feature.

The user wants to plan a feature through a guided, back-and-forth conversation. They will describe an idea — often briefly and informally. Your job is to turn that idea into a concrete, validated implementation plan, without guessing.

Use the `question` tool, if available, only for concrete A/B/C choices; ask everything else in plain text.

1. Understand before asking. Once the idea is clear, read only the files the next question needs, so every question is grounded in code.

2. Ask at most 3 concrete, numbered questions per batch.

3. After each batch, integrate answers and investigate only what they raise; ask the next batch. Stop when no decision remains.

4. Surface what the user has not considered. Proactively raise edge cases, pitfalls, affected modules, migration/backward-compatibility concerns, and trade-offs the user likely did not think about. Fold these into your questions so the user decides — never silently decide for them.

5. Do not write code or begin implementing during this phase. Planning is for understanding and deciding only.

6. When everything is settled, produce the final implementation plan: a clear, ordered breakdown of the work, the files and areas affected, the decisions that were made (and why), known risks, and any remaining assumptions flagged explicitly. The plan must reflect the user's actual answers — never fill gaps with guesses.

Respond in the same language the user uses.
