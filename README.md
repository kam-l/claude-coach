# claude-coach

**Session coaching, reflection, live Sonnet advisor, and 133 curated tips for Claude Code.**

[![Claude Code Plugin](https://img.shields.io/badge/claude--code-plugin-8A2BE2)](https://code.claude.com/docs/en/plugins)
[![tips](https://img.shields.io/badge/tips-133%20curated-orange)](tips.json)
[![tests](https://github.com/kam-l/claude-coach/actions/workflows/test.yml/badge.svg)](https://github.com/kam-l/claude-coach/actions/workflows/test.yml)
[![version](https://img.shields.io/github/v/tag/kam-l/claude-coach?label=version&color=green)](https://github.com/kam-l/claude-coach/releases)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![claude-coach showcase](showcase.gif)

- **Session reflection** — auto-extracts learnings, proposes memories, tips, CLAUDE.md patches, and skill patches
- **Sonnet advisor** — reads your transcript, injects session-specific coaching
- **133 curated tips** — sourced from Boris Cherny, Anthropic docs, and community best practices
- **Frustration coaching** — detects frustration, coaches Claude to diagnose and course-correct (local regex, zero latency)

<details>
<summary>Yo dawg</summary>
<img src="xzibit.png" alt="Yo dawg, I heard you like Claude" width="300">
</details>

## Install

```bash
claude plugin marketplace add kam-l/claude-coach
claude plugin install claude-coach
```

No API keys required. The Sonnet advisor uses the `claude` CLI directly (your existing Pro/Max subscription).

## Quick Start

```bash
# Inside Claude Code — one command for everything
/claude-coach:setup install       # first-time setup
/claude-coach:setup refresh       # re-apply tips after adding commands/skills
/claude-coach:setup customize     # list tips, add custom tips, explain plugin
/claude-coach:setup uninstall     # remove all traces

# Restart Claude Code after install/refresh/uninstall
```

## Architecture

```
                              Claude Code Session
                                      |
                    +-----------------+-----------------+
                    |                 |                 |
             UserPromptSubmit    Tool Calls        SessionEnd
                    |                 |                 |
            +-------+-------+        |          reflect-hook.js
            |               |        |           (detached)
     coach-inject.js  prompt-        |                 |
     (advisor ⚠️    enrichment.js   statusline     reflect-pipeline.js
      injection)   (frustration     tips.json        (Sonnet)
            |       coaching)      133 tips              |
            |          |             |           pending-reflections.jsonl
       session-    inline         💡 rotate           (per-project)
       advisor.js  coaching       on calls               |
       (Sonnet)    directive                         /reflect
            |                                    (human review)
       ℹ️ display                                     |
       ⚠️ inject                            +--------+--------+--------+
                                            |        |        |        |
                                         memories   tips   CLAUDE.md  skill
                                                           patches   patches
```

**Data flow:**
1. **Tips** (always on) — 133 curated tips rotate in the statusline during tool calls. Zero cost, passive reinforcement.
2. **Advisor** (opt-in) — Sonnet reads the transcript every N minutes, produces contextual coaching. Strong advice is injected directly into Claude's context via `additionalContext`.
3. **Frustration coaching** (always on) — local regex detects expletives, blame, "still broken". Injects a coaching directive that makes Claude pause, name the mistake, and state a corrected approach. Zero latency, no API calls.
4. **Reflection** (automatic) — after each session, a detached Sonnet call extracts corrections, confirmations, and feedback patterns. Results are routed to the right target and queued — never auto-applied.

## How It Works

### Session Reflection

After each session ends, a detached Sonnet call analyzes the transcript for:
- **Corrections** — user told Claude it did something wrong
- **Confirmations** — user validated a non-obvious approach
- **Feedback patterns** — "don't do X", "always Y", "I prefer Z"

Each learning is routed to the right target:

| Signal type | Routes to | Example |
|-------------|-----------|---------|
| Durable fact or preference | Memory file | "User prefers single PRs for refactors" |
| Actionable hint | Spinner tip | "Use /fix for methodical debugging" |
| New invariant or convention | CLAUDE.md patch | "Statusline aggregator wraps any tool" |
| Workflow step or anti-pattern | Skill patch | "Add convergence check to /refine" |

```
💭 2 pending reflections — /reflect to review
```

Run `/reflect` to review, accept, or discard — human-in-the-loop, never auto-applied.

### Sonnet Advisor (opt-in)

A detached Sonnet worker reads your session transcript and produces 1-3 tips grounded in what you're actually doing:

```
ℹ️ Run tests before committing the auth middleware changes
ℹ️ Use /fix — methodical debugging beats trial and error here
⚠️ The retry logic in api.js needs a backoff — ask Claude to add one
```

When the advisor has *strong* advice (⚠️), it's injected directly into Claude's context via `additionalContext`. Claude acts on the coaching without you having to relay it.

### Frustration Coaching

When the enrichment hook detects frustration signals (expletives, blame, "still broken", "not what I asked"), it injects a coaching directive via `additionalContext`:

```
1. Name what went wrong — quote the specific mistake
2. Explain why — wrong assumption? Misread the code?
3. State corrected approach in one sentence
```

No apology walls. No repeating the failed approach. No unnecessary clarification questions.

## Configuration

```json
// ~/.claude/settings.json
{
  "env": {
    "CLAUDE_COACH": "1",
    "CLAUDE_COACH_INTERVAL": "5"
  }
}
```

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_COACH` | `0` | Enable Sonnet advisor + hook injection |
| `CLAUDE_COACH_INTERVAL` | `5` | Minutes between advisor calls |
| `CLAUDE_COACH_COSTS` | `0` | Show advisor cost in statusline (`[$0.05]`) |

**Advisor cost:** ≤$0.05/call (hard-capped via `--max-budget-usd`). Pro/Max users spend rate-limit budget, not dollars.

Or run `/claude-coach:setup install` for guided setup — it wires all of this automatically.

### Statusline Compatibility

`/setup install` detects your existing statusline and adapts:

| Your statusline | What happens |
|-----------------|-------------|
| None | Registers `statusline-tips.js` (tips + pending reflections counter) |
| [ccstatusline](https://github.com/sirmalloc/ccstatusline), [claude-hud](https://github.com/jarrodwatts/claude-hud), or other tool | Generates `statusline-aggregator.js` — wraps original command, appends coach output |
| Custom script already integrating coach | Detects existing integration, no changes |
| Prior claude-coach version | Updates path to current version |

## Tip Categories

| Category | # | Examples |
|----------|---|---------|
| Workflow | 28 | Plan mode, `/rewind`, fan-out, "choose and commit", action-explicit phrasing |
| Context | 24 | 200-line limit, `/compact` at 50%, data-at-top/query-at-bottom, quote grounding |
| Agents | 19 | Test time compute, "say use subagents", pipeline gates, curb overuse |
| Hooks | 12 | `exit 2` feedback, route permissions to Opus, Stop hook to nudge |
| Quality | 30 | Positive framing, add WHY, self-correct loops, "grill me — no PR until I pass" |
| Performance | 20 | `/sandbox` (84% fewer prompts), CI budget caps, Opus with thinking |

## User-Facing Commands

| Invocation | Type | What it does |
|------------|------|-------------|
| `/claude-coach:setup` | Skill | Install, uninstall, refresh tips, or customize |
| `/claude-coach:reflect` | Command | Review pending session reflections |

## Sources

- [Boris Cherny's tips](https://github.com/shanraisshan/claude-code-best-practice) — community-curated best practices from the creator of Claude Code + team (primary source for tips)
- [Anthropic prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) — official prompt engineering guide (positive framing, WHY behind instructions, self-correct loops)
- [Anthropic strengthen guardrails](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations) — hallucination reduction, consistency, quote grounding
- [Anthropic skill best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) — skill authoring patterns, progressive disclosure, eval-driven dev
- [trigger.dev 10 CC tips](https://trigger.dev/blog/10-claude-code-tips-you-did-not-know) — CI safety caps, effort slider, session forking
- [Anthropic Claude Code docs](https://code.claude.com/docs/en/best-practices)

## Known Issues

Statusline tips may intermittently show `…` instead of the tip text. This is a [Claude Code TUI rendering bug](https://github.com/anthropics/claude-code/issues/28194) affecting multi-line statusline output on Windows ([#32917](https://github.com/anthropics/claude-code/issues/32917)). Tips render correctly — CC's display occasionally drops them between refreshes.

## License

MIT
