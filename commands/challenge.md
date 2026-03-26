---
disable-model-invocation: true
argument-hint: [target]
---

1. Spawn `adversary` (foreground):
   > Challenge this: {$ARGUMENTS, or the current conversation subject}. Return findings as response text.

2. `AskUserQuestion`: list findings by severity, ask which to address. Fix selected issues.
