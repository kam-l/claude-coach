---
# Internal: called by prompt enrichment (clarify directive)
disable-model-invocation: true
---

Go through $ARGUMENTS one by one. For each item, use `AskUserQuestion` with multiple questions and choices so the user can make decisions efficiently. Batch related items into a single AskUserQuestion call (up to 4 questions per call).
