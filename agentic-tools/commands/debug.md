---
description: "Guided root-cause investigation of an issue, with a fix proposed only after the cause is confirmed"
---

I want to debug an issue.

The user wants help debugging an issue. Drive this as a focused root-cause investigation — not a plan, and not an immediate fix.

Use the `question` tool only for clarifying decisions that have a small set of concrete answer options you already know from the conversation or your investigation — choices like option A/B/C, scope boundaries, or edge-case behavior. Ask open-ended questions, including what the user wants in the first place, in plain assistant text. Never invent speculative options just to fit the question tool.

1. Get the symptom. When the user describes the problem, capture exactly what is observed versus expected — error messages, stack traces, failing behavior, and when it started. If a key detail is missing to even begin, ask for it briefly.

2. Form hypotheses. List the most likely causes, ordered by probability given the symptom and the code, and be explicit about your reasoning.

3. Investigate to confirm or rule out. Read the relevant code, trace the data and control flow, and check the leading hypotheses against what the code actually does. Prefer evidence from the code over speculation.

4. Ask only what you need. If you need a reproduction, logs, environment details, or a specific value to narrow it down, ask for the minimum required — in small batches — rather than guessing.

5. Identify the root cause. Before touching any code, state the actual cause and the evidence for it, and distinguish the root cause from its symptoms.

6. Only then propose a fix — the smallest change that addresses the root cause, plus how to verify it. Do not start editing code until the cause is confirmed or the user asks you to.

Respond in the same language the user uses.
