---
description: "Apply thinking frameworks (inversion, first-principles, pareto, etc.) to analyze decisions, claims, or problems. Also triggers on: \"weigh pros and cons\", \"help me decide\", \"evaluate trade-offs\", \"think this through\", \"analyze from X perspective\", \"what am I missing\", \"second-order effects\", \"reframe this\", \"what would happen if\", or any request for structured analytical reasoning about a decision or claim."
user-invocable: false
argument-hint: "[lens] on [topic/decision]"
remote: true
---

Read the selected reference file from `references/` before applying any framework — applying without reading produces incorrect output formats.

## Intake

Parse the user's input for:
1. **Lens name** (optional) — if provided, use it directly
2. **Topic/decision/claim** — what to analyze

If no lens specified, select the best fit from the table below.

## Selection Table

| Lens | When to use |
|------|------------|
| `10-10-10` | Deciding between options with different time horizons |
| `5-whys` | Symptom presented, need to drill to root cause |
| `eisenhower-matrix` | Overwhelmed with tasks, need to prioritize |
| `first-principles` | Conventional wisdom feels wrong, need to rebuild from truths |
| `inversion` | Planning a goal — ask what guarantees failure |
| `occams-razor` | Multiple explanations, need the simplest valid one |
| `one-thing` | Too many actions possible, need highest-leverage single focus |
| `opportunity-cost` | Evaluating a commitment — what are you giving up? |
| `pareto` | Need to find the 20% that drives 80% of results |
| `second-order` | Action proposed — trace the chain of consequences |
| `swot` | Evaluating a position, project, or strategy |
| `via-negativa` | System feels bloated — improve by removing |

## Dispatch

1. Read `references/{lens}.md`
2. Apply the framework to the user's topic
3. Produce output in the format specified by the reference file
