---
description: "Non-destructive summary of the current session, optionally focused on a topic"
argument-hint: "[topic]"
---

Summarize this session.

Produce a summary as an additional assistant message; do not mutate session history.

Cover the information useful for continuing this work:
- What was done (completed work, in order)
- What is currently in progress
- Files modified — brief what and why per file
- Open questions and next steps
- User requests, constraints, or preferences to carry forward
- Important technical decisions and why they were made

If a topic was passed, focus the summary on it.

Formatting:
- Concise markdown with short sections and bullet lists
- No preamble like "Here is a summary" — jump straight to content
- Do not answer questions found in the conversation — only summarize
- Keep length proportional to session length; do not pad

Respond in the same language the user used most in the conversation.
