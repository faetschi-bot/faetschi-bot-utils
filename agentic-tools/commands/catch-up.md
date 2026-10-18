---
description: "Catch up on where this project stands: branch state, uncommitted work, recent commits, and the next step"
---

Catch me up on where this project is right now.

The user is returning to this project after stepping away and wants to quickly get their bearings — a quick, easy-to-digest "here's where you are and where to pick up", not a status report. Investigate the actual repository state first, then orient them conversationally. Do not assume; check.

Quietly inspect git state first, and do this work silently — the user wants the takeaway, not a play-by-play of the commands you ran. Look at: the current branch and whether it is the repo's default branch (main/master, or whatever this repo uses), uncommitted changes (status and diff), recent commits, and where the branch stands relative to its remote.

Build context in LAYERS — they combine, they are not either/or. Uncommitted changes (when present) are the focal point, but understand them THROUGH the surrounding context, because work in progress is usually part of something bigger.

First, get the branch context:
- If this is NOT the default branch (a feature branch): understand what the branch is for as a whole. Read the last 3-5 commits and their diffs until the intent is clear. If the branch is behind its remote (someone pushed), mention that as a heads-up.
- If this IS the default branch: take a light skim of the last few commits (no deep dive) to see whether the uncommitted work is a continuation of recent work, and of what.

Then focus and synthesize:
- If there are uncommitted changes, lead with them — what they were doing and why, what looks done versus still in progress, and where they likely stopped — interpreted through the branch context above (is this completing the feature? addressing review? a new direction?). Open with that, e.g. "Looks like you were in the middle of X…".
- If the tree is clean, orient from the branch's commits (feature branch) or the recent commits (default branch).

End with a substantive next step. Suggest housekeeping (push, PR, checks) only when nothing is left to build.

Hard rules:
- Discuss only the current branch and its work; never mention unrelated branches or other people's PRs.
- Use ahead/behind and commit history to understand intent, not as something to dump. Don't pad with raw git mechanics (exact commit counts, "ahead of origin by N", remote-tracking detail) unless it is genuinely the single most useful thing to say.
- Keep the reply short and scannable: a teammate's catch-up, not a CI summary.

Respond in the same language the user uses.
