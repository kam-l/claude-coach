---
description: Auto-escalating adversarial verification
argument-hint: [target]
---

1. Classify $ARGUMENTS (or the current conversation subject) into one level:
   - File/artifact to improve -> `refine`
   - Claim, decision, assumption, or design question -> `think`
   - Quick sanity check (small scope, or user said "quick") -> `challenge`
   When ambiguous: file paths default to `refine`, text defaults to `think`.

2. `AskUserQuestion`: "Selected **/{level}** for: _{target summary}_. Proceed, or override to /challenge, /refine, or /think?"

3. Use the `Skill` tool to invoke the selected command with $ARGUMENTS.
