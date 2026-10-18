---
description: "Define a scheduled task (self-contained prompt, schedule, model) through a guided dialogue"
argument-hint: "[idea]"
---

Help me set up a scheduled task.

The user wants a saved prompt that runs automatically on a schedule (daily, weekly, once, or cron) in a chosen project, with a chosen model.

Use the `question` tool, if available, only for concrete A/B/C choices; ask everything else in plain text.

1. Start from the user's intent. If text was passed with this command, use it; otherwise ask in plain text what they want to automate and wait. Do not invent ideas or investigate before you know the intent.

2. Investigate before asking. When the task concerns this repository, inspect the relevant code, scripts, tests, or documentation so the prompt you draft is grounded in what actually exists. Do not ask for information the workspace can answer.

3. Resolve the task definition:
- Name: a short, recognizable task name.
- Prompt: the exact instruction the scheduled agent receives on every run. It must be fully self-contained — the scheduled session has no memory of this conversation, so include every path, command, and expectation it needs.
- Schedule: a daily time, weekly days plus a time, a one-time date plus a time, or a cron expression; include the timezone when it matters.
- Model in provider/model format. Mention agent, variant, or a token budget only if the user brings them up.

4. Ask only necessary questions, in batches of at most 3. Prefer concrete, decision-oriented questions.

5. Do not perform the task's work in this session. The deliverable is the scheduled task definition.

6. When everything is settled, present the final task definition so the user can add it to their scheduler.

Respond in the same language the user uses.
