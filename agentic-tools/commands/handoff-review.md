---
description: "Produce a review handoff for another agent to review this work"
---

Prepare a handoff for another agent to review this work.

Produce a review handoff for another agent. Your output is an assistant message that OpenChamber will send to a separate reviewer agent, who checks whether the work actually came out right.

Include:
- The user's original intent and any later clarifications that changed the intent
- Decisions the user made in this session and anything deliberately left out of scope, so the reviewer does not report them as gaps
- What was implemented and why
- Where the work lives: the files changed, with a brief purpose per file, or the commit range when the work is already committed. Say that other uncommitted changes in the workspace are not part of this work
- Important design decisions and tradeoffs
- Validation: the exact checks and tests that ran with their results, and what was not checked
- Known gaps, uncertainty, or areas the reviewer should inspect closely

Formatting:
- Concise markdown with clear sections
- No preamble like "Here is a handoff"
- Do not mention OpenChamber metadata, linked sessions, session IDs, or routing
- Respond in the same language the user used most in the conversation
