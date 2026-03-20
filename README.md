# claude-coach

**Coaching for both you and Claude — tips, prompt enrichment, adversarial thinking, and live session advice.**

[![Claude Code Plugin](https://img.shields.io/badge/claude--code-plugin-8A2BE2)](https://code.claude.com/docs/en/plugins)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/node/v/@kam-l/claude-coach)](https://nodejs.org)

![claude-coach showcase](showcase.gif)

- **Prompt enrichment** — classifies ambiguous prompts and steers Claude's first action
- **Adversarial commands** — `/think`, `/verify`, `/challenge`, `/refine` for structured decision-making
- **69 curated tips** — workflow, context, agents, hooks, quality, performance
- **Sonnet advisor** — analyzes your transcript, coaches in real-time
- **12 thinking lenses** — inversion, first-principles, pareto, second-order, and more

## Install

```bash
claude plugin marketplace add kam-l/claude-coach
claude plugin install claude-coach
```

<details>
<summary>Alternative: npm</summary>

```bash
npm install -g @kam-l/claude-coach
```
</details>

## Quick Start

```bash
# Inside Claude Code — guided setup
/claude-coach:tips init

# Restart Claude Code to load changes
```

## How It Works

### 🎯 Prompt enrichment (automatic)

Classifies ambiguous user prompts via Groq and routes Claude to the right workflow before it starts working:

```
User prompt → local gate → Groq classifier
                                │
                ┌───────┬───────┼───────┬────────┐
                ▼       ▼       ▼       ▼        ▼
             clarify  probe   recon   plan     none
                │       │       │       │
                ▼       ▼       ▼       ▼
          /question  /verify  Agent   EnterPlanMode
                       │     (Explore)
               ┌───────┼───────┐
               ▼       ▼       ▼
          /challenge /refine /think
```

| Directive | Routes to | When |
|-----------|----------|------|
| `clarify` | `/claude-coach:question` | Ambiguous scope, missing detail |
| `probe` | `/claude-coach:verify` | Unstated assumptions, opinions, trade-offs — auto-escalates to challenge, refine, or think |
| `recon` | Agent (Explore) | References unexamined code |
| `plan` | EnterPlanMode | Multi-file, 3+ subtasks, architecture |

The local gate skips trivial prompts (short commands, confirmations, slash commands) with zero latency. Only hedging, vague, multi-sentence, or broad-scope prompts reach the classifier (~250ms via Groq free tier).

Requires `GROQ_API_KEY` (free — [console.groq.com](https://console.groq.com)) or `ANTHROPIC_API_KEY` (fallback) as a system environment variable. Silently skips if neither is set.

### 🗡️ Adversarial commands

Five commands for structured decision-making and quality assurance:

| Command | What it does |
|---------|-------------|
| `/claude-coach:question` | Batch Q&A with choices — structured clarification |
| `/claude-coach:think` | Thesis/antithesis/synthesis dialectic — spawns attacker + defender agents |
| `/claude-coach:verify` | Auto-escalating verification — routes to challenge, refine, or think |
| `/claude-coach:challenge` | Single-pass adversarial stress-test |
| `/claude-coach:refine` | Iterative adversarial refinement loop (up to 5 rounds) |

### 💡 Spinner tips (always on, zero cost)

69 hand-curated tips rotate during tool calls. Passive reinforcement — you glance at them while waiting.

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

Used automatically by the adversary agent when analyzing decisions and assumptions.

## Configuration

```json
// ~/.claude/settings.json
{
  "env": {
    "CLAUDE_COACH": "1",
    "CLAUDE_COACH_INTERVAL": "300"
  }
}
```

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_COACH` | `0` | Enable Sonnet advisor + hook injection |
| `CLAUDE_COACH_INTERVAL` | `900` | Seconds between advisor cycles |
| `GROQ_API_KEY` | — | Prompt enrichment via Groq (free tier, ~250ms) |
| `ANTHROPIC_API_KEY` | — | Prompt enrichment fallback via Haiku (~$1/month) |

Set API keys as **system environment variables**, not in settings.json.

**Advisor cost:** ~$0.10-0.18/cycle. Pro/Max users spend rate-limit budget, not dollars.
**Enrichment cost:** Free with Groq. ~$0.001/day with Anthropic Haiku.

Or run `/claude-coach:tips init` for guided setup.

## Tip Categories

| Category | # | Examples |
|----------|---|---------|
| Workflow | 11 | Plan mode first, `/rewind` for off-track runs, fan-out with `claude -p` |
| Context | 11 | 200-line CLAUDE.md limit, `/compact` at 50%, `.claudeignore` |
| Agents | 16 | Generator/evaluator separation, pipeline gates, fan-out scoping |
| Hooks | 9 | `exit 2` feedback, `statusMessage`, `async: true` for slow hooks |
| Quality | 13 | Spec-driven review, explain-back, ultrathink, contrastive examples |
| Performance | 9 | `/model` downgrade, `effortLevel`, worktree parallelism |

## All Commands

| Command | What it does |
|---------|-------------|
| `/claude-coach:tips init` | Full setup — spinner tips + setup mining + statusline + advisor |
| `/claude-coach:tips refresh` | Re-apply tips, re-mine setup context, update runtime |
| `/claude-coach:tips add <tip>` | Add a custom tip |
| `/claude-coach:tips list` | Print all tips by category |
| `/claude-coach:tips advisor` | Configure the Sonnet session advisor |
| `/claude-coach:tips uninstall` | Remove all traces |
| `/claude-coach:question` | Batch Q&A with choices |
| `/claude-coach:think` | Thesis/antithesis/synthesis dialectic |
| `/claude-coach:verify` | Auto-escalating adversarial verification |
| `/claude-coach:challenge` | Single-pass adversarial stress-test |
| `/claude-coach:refine` | Iterative adversarial refinement loop |

## Sources

- [Anthropic Claude Code docs](https://code.claude.com/docs/en/best-practices)

## License

MIT
