# claude-coach

**Adversarial stress-testing, live session advisor, and 127 curated tips for Claude Code.**

[![Claude Code Plugin](https://img.shields.io/badge/claude--code-plugin-8A2BE2)](https://code.claude.com/docs/en/plugins)
[![tips](https://img.shields.io/badge/tips-127%20curated-orange)](tips.json)
[![tests](https://github.com/kam-l/claude-coach/actions/workflows/test.yml/badge.svg)](https://github.com/kam-l/claude-coach/actions/workflows/test.yml)
[![version](https://img.shields.io/github/v/tag/kam-l/claude-coach?label=version&color=green)](https://github.com/kam-l/claude-coach/releases)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

<img src="xzibit.png" alt="Yo dawg, I heard you like Claude" width="300">

![claude-coach showcase](showcase.gif)

- **127 curated tips** — sourced from Boris Cherny, Anthropic docs, and community best practices
- **`/verify`** — auto-escalating adversarial verification (challenge, refine, or dialectic)
- **Sonnet advisor** — reads your transcript, injects session-specific coaching (⚠️ inject / ℹ️ display)
- **Frustration detection** — auto-routes to `/verify` when things go sideways (local regex, zero latency)
- **12 thinking lenses** — inversion, first-principles, pareto, second-order, and more

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

## How It Works

### 🗡️ Adversarial verification

One user-facing command — `/verify` — auto-escalates based on what you point it at. Also triggered automatically when frustration is detected (expletives, blame, "still broken", etc.):

| Target type | Escalates to | What happens |
|-------------|-------------|--------------|
| File or artifact | `refine` | Iterative adversary loop (up to 5 rounds) |
| Claim or decision | `think` | Hegelian dialectic — attacker + defender agents |
| Quick sanity check | `challenge` | Single-pass stress-test |

### 💡 Spinner tips (always on, zero cost)

127 hand-curated tips (sourced from Boris Cherny, Anthropic team best practices, and community) rotate during tool calls. Passive reinforcement — you glance at them while waiting.

### ℹ️ Sonnet advisor (opt-in)

A detached Sonnet worker reads your session transcript and produces 1-3 tips grounded in what you're actually doing:

```
ℹ️ Run tests before committing the auth middleware changes
ℹ️ Use /fix — methodical debugging beats trial and error here
ℹ️ The retry logic in api.js needs a backoff — ask Claude to add one
```

When the advisor has *strong* advice, it's injected directly into Claude's context via `additionalContext`. Claude acts on the coaching without you having to relay it.

## Bundled Agents

| Agent | Role |
|-------|------|
| `adversary` | Universal stress-tester — finds concrete problems with quality + analytical lenses |
| `attacker` | Antithesis advocate — builds the case AGAINST a claim (used by `/think`) |
| `defender` | Thesis advocate — builds the case FOR a claim (used by `/think`) |

## Thinking Lenses

12 analytical frameworks available via the `structured-thinking` skill:

`inversion` · `first-principles` · `second-order` · `5-whys` · `pareto` · `via-negativa` · `opportunity-cost` · `occams-razor` · `10-10-10` · `eisenhower-matrix` · `swot` · `one-thing`

Based on [taches-cc-resources/commands/consider](https://github.com/glittercowboy/taches-cc-resources/tree/main/commands/consider) by Lex Christopherson (MIT). Used automatically by the adversary agent when analyzing decisions and assumptions.

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

## Tip Categories

| Category | # | Examples |
|----------|---|---------|
| Workflow | 25 | Plan mode, `/rewind`, fan-out, "choose and commit", action-explicit phrasing |
| Context | 23 | 200-line limit, `/compact` at 50%, data-at-top/query-at-bottom, quote grounding |
| Agents | 19 | Test time compute, "say use subagents", pipeline gates, curb overuse |
| Hooks | 11 | `exit 2` feedback, route permissions to Opus, Stop hook to nudge |
| Quality | 30 | Positive framing, add WHY, self-correct loops, "grill me — no PR until I pass" |
| Performance | 19 | `/sandbox` (84% fewer prompts), CI budget caps, Opus with thinking |

## User-Facing Commands

| Invocation | Type | What it does |
|------------|------|-------------|
| `/claude-coach:setup` | Skill | Install, uninstall, refresh tips, or customize |
| `/claude-coach:verify` | Command | Auto-escalating adversarial verification |

Internal (called by enrichment or `/verify` — not invoked directly):
`question`, `challenge`, `refine`, `think`

## Sources

- [Boris Cherny's tips](https://github.com/shanraisshan/claude-code-best-practice) — community-curated best practices from the creator of Claude Code + team (primary source for tips)
- [Anthropic prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) — official prompt engineering guide (positive framing, WHY behind instructions, self-correct loops)
- [Anthropic strengthen guardrails](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations) — hallucination reduction, consistency, quote grounding
- [Anthropic skill best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) — skill authoring patterns, progressive disclosure, eval-driven dev
- [trigger.dev 10 CC tips](https://trigger.dev/blog/10-claude-code-tips-you-did-not-know) — CI safety caps, effort slider, session forking
- [taches-cc-resources](https://github.com/glittercowboy/taches-cc-resources) by Lex Christopherson — 12 thinking lenses (MIT)
- [Anthropic Claude Code docs](https://code.claude.com/docs/en/best-practices)

## Known Issues

Statusline tips may intermittently show `…` instead of the tip text. This is a [Claude Code TUI rendering bug](https://github.com/anthropics/claude-code/issues/28194) affecting multi-line statusline output on Windows ([#32917](https://github.com/anthropics/claude-code/issues/32917)). Tips render correctly — CC's display occasionally drops them between refreshes.

## License

MIT
