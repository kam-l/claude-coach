# Claude Code Interaction Patterns

Human-gate actions users forget to take. Use as reference for session-specific advice.

## After many changes

- **Explain-back**: Ask Claude to walk through the code it just wrote, step by step. Catches logic errors the author can't see.
- **Visual diff**: Request an ASCII table or diagram summarizing what changed and why. Forces structured thinking.
- **Surface assumptions**: "What assumptions did you make? Which ones could be wrong?" — prevents silent drift.
- **Spot-check**: Pick one changed file and ask Claude to prove it handles edge cases.

## After architecture / design decisions

- **Challenge assumptions**: "What's the strongest argument against this approach?" — invokes adversarial thinking.
- **Trade-off matrix**: Ask for a pros/cons table of alternatives considered. Makes implicit trade-offs explicit.
- **ASCII diagrams**: "Draw the data flow / component layout as ASCII art." — spatial reasoning catches misconnections.
- **Blast radius**: "What breaks if this assumption is wrong?" — forces failure-mode thinking.

## Long sessions (context > 40%)

- **`/compact`**: Summarize and compress context. Do this proactively at ~50%, not at the limit.
- **`/clear`**: If context is polluted with failed attempts, start clean with a better prompt.
- **Fresh session**: One task per session. Long sessions degrade quality measurably after 50-60% context.
- **Checkpoint**: Save progress (`/save`) before context rot makes the session unreliable.

## Stuck or looping

- **`/rewind`**: Undo the last off-track run instead of correcting in-context (adds noise).
- **Reframe**: Describe the symptom differently. "The test fails" → "The mock returns undefined when..."
- **Different approach**: If the same fix fails twice, the mental model is wrong. Step back and re-diagnose.
- **Minimal repro**: Strip the problem to the smallest failing case. Reduces noise for Claude and for you.

## Before committing

- **Tests**: "Write tests for the changes you just made." — catches regressions before they ship.
- **Edge cases**: "What inputs would break this? Handle them." — defensive coding prompt.
- **PR summary**: "Summarize these changes as a PR description." — forces coherent narrative.
- **Security scan**: "Are there any injection, XSS, or auth bypass risks in these changes?"

## Quality gates

- **Challenge**: Stress-test the work. Fresh adversarial eyes catch what the author can't.
- **Production risks**: "What could go wrong in production that works fine locally?"
- **Error paths**: "Trace through every error path. Do they all handle gracefully?"
- **Performance**: "Are there any O(n²) loops, unbounded queries, or memory leaks?"
