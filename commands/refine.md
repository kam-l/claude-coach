---
description: Iterative adversarial refinement loop
argument-hint: [target]
---

1. Resolve artifacts dir: `$HOME/.claude/sessions/{session_id}/refine/` -- substitute `session_id` from your context and `$HOME` to the absolute path. Run `mkdir -p` via Bash. Pass the **resolved absolute path** (not `~`) to all subagent prompts -- Write tool doesn't expand tilde.

2. Spawn `adversary` (foreground):
   > Challenge this: {$ARGUMENTS, or the current conversation subject}. Write findings to `{refine_dir}/findings-round-1.md`. Return findings as response text.

3. Fix every CRITICAL and IMPORTANT finding in the artifact. Skip NOTEs unless trivial.

4. Resume the same adversary (do NOT re-spawn -- it needs prior context for convergence detection). Always run at least 2 rounds. Repeat until exit:
   > Artifact refined. Re-challenge the target. Compare to prior findings in `{refine_dir}/findings-round-{N-1}.md`. Write new findings to `{refine_dir}/findings-round-{N}.md`. If >50% repeat or are minor variations, output `Result: CONVERGED`.
   - `CONVERGED` or `PASS` -> exit loop
   - `REVISE` or `FAIL` -> fix findings, continue
   - Round 5 -> exit regardless (safety cap)

5. `AskUserQuestion`: rounds completed, final verdict, changes made, unresolved findings. Ask: accept, address remaining, or revert?
