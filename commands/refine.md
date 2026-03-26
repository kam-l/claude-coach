---
description: "Adversarial refinement with mandatory structural rethink. Correctness first (iterative convergence), then architecture (fresh-eyes rethink). Use for any artifact, code, plan, or implementation that needs adversarial pressure. Also triggers on: 'refine', 'stress-test code', 'is this good enough', 'review my changes', 'polish this'."
argument-hint: "[target]"
remote: true
---

1. Resolve artifacts dir: `.artifacts/refine/`. Run `mkdir -p` via Bash.

2. Determine starting gear from prompt signals:
   - "quick", "sanity check", small scope → gear 1 (spot-check)
   - Default, or significant artifact → gear 2 (refine)
   - "structural", "mediocre", "wrong approach", "hack" → gear 3 (rethink)

3. Spawn `adversary` (foreground):
   > Critique this: {$ARGUMENTS, or the current conversation subject}. Start at gear {N} per your `structured-critique` skill. Write findings to `{refine_dir}/findings-round-1.md`. Return findings as response text.

4. Route on result:

   **Gear 1 exit** (all SUGGESTION/NOTE, no CRITICALs):
   → `AskUserQuestion` with findings. Skip to step 6.

   **Gear 1 → 2 escalation** (CRITICALs found):
   → Fix every CRITICAL and IMPORTANT. Skip NOTEs unless trivial. Continue to step 5.

   **Gear 2 → 3 early escalation** (structural mediocrity — same dimension hit 3+):
   → `AskUserQuestion`: "Structural flaw: _{root flaw}_. Elegant direction: _{proposal}_. Pivot to redesign, adjust direction, or continue polishing?"
   - Pivot → write brief to `.artifacts/ideas/{date}-rethink-{topic}.md`, suggest `/clear` then `/design`. Skip to step 8 (summary).
   - Adjust → incorporate direction, resume iteration
   - Continue → ignore structural finding, keep refining

5. Iterate (gear 2): Spawn a new `adversary` each round (foreground). Minimum 2 rounds. Repeat until exit:
   > Round {N} re-challenge of: {$ARGUMENTS, or the current conversation subject}. Previous findings at `{refine_dir}/findings-round-{N-1}.md`. Write to `{refine_dir}/findings-round-{N}.md`. If >50% of findings repeat or are minor variations: `Result: CONVERGED`.
   - `CONVERGED` or `PASS` → exit to step 6
   - `REVISE` or `FAIL` → fix findings, continue
   - Round 5 → exit (safety cap)

6. **Mandatory rethink pass.** Spawn a FRESH `adversary` (separate from step 3/5 — fresh eyes catch what iterative fixing misses):
   > Structural rethink of: {$ARGUMENTS, or the current conversation subject}. Ignore correctness (already verified). Focus ONLY on:
   > - Is the responsibility in the right place? Could this logic live at a higher/lower abstraction?
   > - Are there N places doing the same check that should be 1?
   > - Will this design break when the next similar feature is added?
   > - Is there a hidden coupling or maintenance burden?
   > Write to `{refine_dir}/rethink.md`. Severity: STRUCTURAL (worth redesigning) or OBSERVATION (note for later). Return findings.

7. Route on rethink:
   - No STRUCTURAL findings → proceed to step 8
   - STRUCTURAL findings → `AskUserQuestion`: "Rethink found: _{finding}_. Proposed direction: _{proposal}_. Redesign, note for later, or dismiss?"
     - Redesign → apply changes, re-run tests
     - Note → append to `.artifacts/ideas/{date}-rethink-{topic}.md`
     - Dismiss → proceed

8. `AskUserQuestion`: rounds completed, rethink verdict, changes made, unresolved findings. Ask: accept, address remaining, or revert?
