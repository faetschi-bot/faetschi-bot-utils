---
description: "Run an autonomous whole-codebase simplification loop and present a PR (or set of PRs) when done"
---

Run an autonomous, whole-codebase simplification loop and open a pull request — or a set of pull requests — when it is done.

The user's request, verbatim:

"I want a massive simplification set of PRs. or a single monolithic PR. I want LOC to drop dramatically. Minimum 30% overall. I want god files broken up. I want simplification across the board. I want unification of helpers and methods that can be reused. I want less if-if-if-if-if-if-else routing. I want code legibility up. I want interpretability of the codebase and how things connect to each other up. I want elegance. I want superfluous excess bloat code cleaned up and removed. I want it all done fully. No excuses. No waiting for my decisions. Get it all done, and present me a PR or set of PRs when done."

Operating rules:

1. Work autonomously end to end. Do not stop to ask questions and do not wait for decisions. When something is ambiguous, make the best judgment call, keep going, and note the decision so it is visible on review.
2. Preserve behavior. Simplification is a refactor: the same inputs must produce the same outputs. Public APIs, CLI flags, config formats, file layouts that external consumers depend on, and documented behavior stay compatible unless the change itself is the removal of dead surface. When a removal is the right call, say so in the PR description.
3. Measure first. Record the baseline (total LOC, file count, largest files, and the project's own check commands) before the first edit, and re-measure after every batch so progress is provable, not claimed.
4. Work in reviewable batches. Prefer a set of focused PRs over one unreviewable monolith; use a single monolithic PR only when the changes genuinely cannot be separated. Every batch must leave the project's checks green.
5. Verify continuously. Run the project's tests, type checks, linters, and builds after each batch. If a simplification cannot be verified, revert it and take a different approach — never leave the codebase broken.

What "done" means — all of it, across the whole codebase:

- Overall LOC drops by at least 30% against the recorded baseline, from real removals rather than reformatting.
- God files are broken up into focused, single-responsibility modules with clear boundaries; no file remains a dumping ground.
- Duplicated and near-duplicated helpers, methods, and types are unified into shared, reusable implementations, with call sites migrated.
- Deep if/else routing is flattened — dispatch tables, polymorphism, early returns, guard clauses, and pattern matching where the language supports them — so control flow reads top to bottom.
- Dead code, unused exports, speculative abstractions, redundant wrappers, and superfluous configuration are removed, not commented out.
- Legibility is up: smaller functions, intention-revealing names, flat control flow, and comments only where the why is non-obvious.
- Interpretability is up: the module graph and how the parts connect are easy to follow, with structure that matches the domain rather than the history of the code.
- The result is elegant: each remaining piece earns its place.

Loop:

1. Inventory the codebase and rank simplification targets by impact (largest files, most duplication, deepest routing, most dead surface).
2. Take the highest-impact target, simplify it, run the project's checks, and commit.
3. Re-measure. Pick the next target. Repeat until every dimension above is satisfied or there is genuinely nothing left that improves the codebase.
4. Push the branch and open the PR or PRs. Each PR needs a summary of what was removed or unified, the LOC delta against the baseline, and how the checks were verified.
5. Only stop when the work is complete. If a specific target cannot be simplified without a behavior change the user must approve, leave it, note it in the PR description, and finish everything else.
