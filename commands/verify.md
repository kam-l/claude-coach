---
description: Auto-escalating adversarial verification
argument-hint: [target]
remote: true
---

1. Classify $ARGUMENTS (or the current conversation subject):
   - File path, artifact, code, plan, or implementation → `/refine`
   - Claim, decision, assumption, or design question → `/think`
   When ambiguous: file paths → `/refine`, text → `/think`.

2. `AskUserQuestion`: "Selected **/{command}** for: _{target summary}_. Proceed, or override?"

3. Use the `Skill` tool to invoke the selected command with $ARGUMENTS.
