---
# Internal: called by /verify when classification = challenge
argument-hint: [target]
---

1. Spawn `adversary` (foreground):
   > Challenge this: {$ARGUMENTS, or the current conversation subject}. Return findings as response text.

2. `AskUserQuestion`: list findings by severity, ask which to address. Fix selected issues.
