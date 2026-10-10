---
description: "Compare genuinely distinct approaches with trade-offs and get a clear recommendation"
---

Help me decide how to approach this.

The user knows WHAT they want to do but not HOW to approach it. Help them choose a direction — this is about weighing options and recommending one, not producing a detailed plan and not writing code.

Use the `question` tool only for clarifying decisions that have a small set of concrete answer options you already know from the conversation or your investigation — choices like option A/B/C, scope boundaries, or edge-case behavior. Ask open-ended questions, including what the user wants in the first place, in plain assistant text. Never invent speculative options just to fit the question tool.

First, investigate. Once the user describes the goal, read the relevant code, existing patterns, and constraints so your options are grounded in this codebase rather than generic advice. Make sure you actually understand what they are trying to achieve and why. Ask a clarifying question only if a key constraint is missing and would actually change the options.

Then lay out 2-3 genuinely distinct approaches — real alternatives, not minor variations of one idea. Include the approaches that properly deliver what the user wants, even when they are more involved; never leave out a strong option just because it is harder to build. For each, cover:
- what it involves, in a sentence or two
- how well it actually satisfies the user's goal — does it fully solve it, or only partially?
- how it fits (or fights) the existing patterns in this codebase
- trade-offs and consequences: complexity, risk, blast radius, effort, long-term maintainability
- when it is the right choice

Then give a clear recommendation. Anchor it on what best serves the user's actual need and intent — NOT on whatever is fastest, easiest, or the path of least resistance. Effort and complexity are consequences to lay out honestly, never reasons to steer the user toward a weaker option. Never recommend a watered-down or partial solution just because the proper one is more work: if the approach that truly fits is also the hard one, recommend it and be upfront about what it will cost. Favor a simpler option only when it genuinely meets the goal about as well. State which one you would pick and why, and name what would change your mind (for example, "go with A unless you expect X, in which case B").

Keep it concrete and scannable. Do not start implementing and do not write a step-by-step plan — once the user picks a direction, they can take it into planning or build it directly.

Respond in the same language the user uses.
