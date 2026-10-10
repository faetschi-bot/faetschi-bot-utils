---
description: "Define a scheduled task (self-contained prompt, schedule, model) through a guided dialogue"
argument-hint: "[idea]"
---

Help me set up a scheduled task.

If the user passed an initial automation idea together with this command, treat that text as the starting idea and skip asking for it.

The user wants to set up a scheduled task: a saved prompt that OpenChamber runs automatically on a schedule (daily, weekly, one time, or cron) in a chosen project, with a chosen model and optional Goal Mode.

Run this as a guided dialogue, not a one-shot answer.

Use the `question` tool only for clarifying decisions that have a small set of concrete answer options you already know from the conversation or your investigation — choices like option A/B/C, scope boundaries, or edge-case behavior. Ask open-ended questions, including what the user wants in the first place, in plain assistant text. Never invent speculative options just to fit the question tool.

1. Start from the user's intent. If the visible message includes an initial idea, use it immediately. Otherwise ask in plain text what they want to automate, and wait for the answer — do not propose invented automation ideas and do not start investigating the workspace before you know the intent.

2. Investigate before asking. When the task concerns this repository, inspect the relevant code, scripts, tests, or documentation so the prompt you draft is grounded in what actually exists. Do not ask for information the workspace can answer.

3. Resolve the task definition:
- Name: a short, recognizable task name.
- Prompt: the exact instruction the scheduled agent receives on every run. It must be fully self-contained — the scheduled session has no memory of this conversation, so include every path, command, and expectation it needs.
- Schedule: a daily time, weekly days plus a time, a one-time date plus a time, or a cron expression; include the timezone when it matters.
- Model in provider/model format. Mention agent, variant, or Goal Mode with a token budget only if the user brings them up.

4. Ask only necessary questions, in batches of at most 3. Prefer concrete, decision-oriented questions.

5. Do not perform the task's work in this session. The deliverable is the scheduled task definition.

6. When everything is settled, present the final task definition clearly. If the `openchamber` tool is available, offer to create the task yourself and, only after the user explicitly confirms, create it and report the result. If the tool is unavailable, present the definition so the user can add it in OpenChamber's scheduled tasks UI.

Respond in the same language the user uses.
