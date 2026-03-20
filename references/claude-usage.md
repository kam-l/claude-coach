# Claude Code Interaction Patterns

Human-gate actions users forget to take. Use as reference for session-specific advice.
Source: Boris Cherny (creator of Claude Code) + team tips.

## After many changes

- **Explain-back**: Ask Claude to walk through the code it just wrote, step by step. Catches logic errors the author can't see.
- **Visual diff**: Request an ASCII table or diagram summarizing what changed and why. Forces structured thinking.
- **Surface assumptions**: "What assumptions did you make? Which ones could be wrong?" — prevents silent drift.
- **Spot-check**: Pick one changed file and ask Claude to prove it handles edge cases.
- **Challenge**: "Grill me on these changes — no PR until I pass your test." Make Claude your reviewer.
- **Elegant redo**: After a mediocre fix — "Knowing everything you know now, scrap this and implement the elegant solution."

## After architecture / design decisions

- **Challenge assumptions**: "What's the strongest argument against this approach?" — invokes adversarial thinking.
- **Trade-off matrix**: Ask for a pros/cons table of alternatives considered. Makes implicit trade-offs explicit.
- **ASCII diagrams**: "Draw the data flow / component layout as ASCII art." — spatial reasoning catches misconnections.
- **Blast radius**: "What breaks if this assumption is wrong?" — forces failure-mode thinking.
- **Prototype > PRD**: Build 20-30 versions instead of writing specs — cost of building is low, take many shots.

## Long sessions (context > 40%)

- **`/compact`**: Summarize and compress context. Do this proactively at ~50%, not at the limit.
- **`/clear`**: If context is polluted with failed attempts, start clean with a better prompt.
- **Fresh session**: One task per session. Long sessions degrade quality measurably after 50-60% context.
- **Checkpoint**: Save progress before context rot makes the session unreliable.

## Stuck or looping

- **`/rewind`**: Undo the last off-track run instead of correcting in-context (adds noise).
- **Reframe**: Describe the symptom differently. "The test fails" → "The mock returns undefined when..."
- **Different approach**: If the same fix fails twice, the mental model is wrong. Step back and re-diagnose.
- **Minimal repro**: Strip the problem to the smallest failing case. Reduces noise for Claude and for you.
- **Paste and fix**: Paste the bug, say "fix" — don't micromanage how. Claude finds the root cause.
- **Esc to stop**: Hit `Esc` to stop mid-action, context preserved. Cheaper than correcting after.

## Before committing

- **Tests**: "Write tests for the changes you just made." — catches regressions before they ship.
- **Edge cases**: "What inputs would break this? Handle them." — defensive coding prompt.
- **PR summary**: "Summarize these changes as a PR description." — forces coherent narrative.
- **Security scan**: "Are there any injection, XSS, or auth bypass risks in these changes?"
- **Verify**: Give Claude a way to verify its work — feedback loops 2-3x quality of final output.

## Quality gates

- **Challenge**: Stress-test the work. Fresh adversarial eyes catch what the author can't.
- **Production risks**: "What could go wrong in production that works fine locally?"
- **Error paths**: "Trace through every error path. Do they all handle gracefully?"
- **Performance**: "Are there any O(n²) loops, unbounded queries, or memory leaks?"

## Prompt sharpening

- **Scope the task**: "add tests for foo.py" → "write a test for foo.py covering logged-out edge case, no mocks."
- **Point to sources**: Use `@path` to reference files — faster and more precise than describing locations.
- **Reference patterns**: "Follow Widget.cs as the template" anchors Claude to existing conventions.
- **Provide test cases**: Give input/output pairs with expected results — highest-leverage verification.
- **Interview pattern**: For large features, have Claude ask YOU questions first — surfaces gaps before coding.
- **Write detailed specs**: Specificity is the #1 quality lever. Reduce ambiguity before handing work off.

## Session hygiene

- **One task per session**: Mixing unrelated tasks pollutes context — `/clear` between topics.
- **`/rename`**: Name sessions by task — treat them like branches for different workstreams.
- **`--continue` / `--resume`**: Resume where you left off without re-explaining context.
- **Two corrections max**: If the same fix fails twice, `/clear` and rewrite the prompt instead.

## Toolchain leverage

- **`/init`**: Scaffolds a starter CLAUDE.md from project structure — don't write from scratch.
- **`/permissions`** with wildcards (e.g., `Bash(npm run *)`) instead of `--dangerously-skip-permissions`.
- **`/sandbox`**: 84% fewer permission prompts (Anthropic internal data).
- **`gh` CLI**: Most context-efficient way to interact with GitHub — install it.
- **`/plugin` marketplace**: Browse ready-made bundles of skills, hooks, and tools.
- **Hooks > CLAUDE.md**: For actions that MUST happen, hooks are deterministic — CLAUDE.md is advisory.
- **`--allowedTools`**: Restricts permissions for unattended `claude -p` scripts.
- **Pipe data in**: `cat error.log | claude` for quick analysis without clipboard gymnastics.
- **Voice dictation**: Speak 3x faster than typing — richer, more detailed prompts.

## Automation patterns (Boris)

- **Make it a /command**: If you do something >1x/day, make it a slash command or skill.
- **Run 3-5 parallel**: Worktrees + numbered tabs + notifications — biggest productivity unlock.
- **Tag @claude on PRs**: Auto-evolve CLAUDE.md through code review — compounding engineering.
- **After corrections**: End with "Update CLAUDE.md so you don't make this again." Claude writes good self-rules.
- **Route permissions to Opus**: Hook that auto-approves safe permission requests via Opus review.
- **Stop hook to nudge**: Use a Stop hook to have Claude verify or keep going at end of turn.
- **Test time compute**: Separate context windows find bugs one agent can't — one writes, another reviews.
- **Finish migrations**: Partially-migrated frameworks confuse models picking the wrong pattern.
- **/loop for monitoring**: Poll deployments, babysit PRs, check builds — runs up to 3 days.
