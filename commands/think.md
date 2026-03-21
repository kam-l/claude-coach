---
description: Thesis/antithesis/synthesis dialectic
argument-hint: [claim-or-design-to-challenge]
---

<workflow>

1. Ultrathink on $ARGUMENTS. Decompose into:
   - **Claims**: Every debatable assertion, implicit or explicit. Restate each as a clear, single-sentence thesis.
   - **Context**: File paths, references, or background information (not claims).
   If only one claim -> proceed to step 2.
   If multiple claims -> `AskUserQuestion`: present the numbered list of extracted claims. Let the user pick which to dialectic (one, several, or all). Then run step 2 for each selected claim sequentially.

2. Create an agent **TEAM** with two teammates for adversarial debate:
   - **Thesis advocate** (defender):
     > You are the thesis advocate. Your job: build the strongest possible case FOR this claim: "{thesis}". Read these files for context: {extracted file paths, or omit if none}.
     >
     > Follow the role, process, output format, and constraints defined in the `defender` agent definition.
     >
     > After your initial analysis, message the antithesis teammate to challenge their counter-arguments. Debate directly -- try to dismantle their objections with evidence. Continue debating until you start repeating yourself (convergence). Max 3 rounds of back-and-forth.
   - **Antithesis challenger** (attacker):
     > You are the antithesis challenger. Your job: build the strongest possible case AGAINST this claim: "{thesis}". Read these files for context: {extracted file paths, or omit if none}.
     >
     > Follow the role, process, output format, and constraints defined in the `attacker` agent definition.
     >
     > After your initial analysis, message the thesis teammate to challenge their defense. Debate directly -- try to dismantle their supporting arguments with evidence. Continue debating until you start repeating yourself (convergence). Max 3 rounds of back-and-forth.

3. When both teammates go idle (debate converged), read their final positions. **Synthesize** (you are the Hegelian judge):
   - **Common ground**: Where thesis and antithesis agree
   - **Genuine tensions**: Strong evidence on both sides -- what's truly contested?
   - **Synthesis**: A position that transcends both. Incorporate strongest elements of each, resolve tensions. This is NOT a compromise -- it's a higher-order insight.
   - **Open questions**: What remains genuinely unresolved?

4. Clean up the team.

5. `AskUserQuestion` with the synthesis, key tensions, and decision points for the user to weigh in on.
   
<workflow>

<constraints>

- NEVER spawn agents outside of a team
- `attacker` and `defender` agents **MUST** be spawned inside a **TEAM**
  
</constraints>
