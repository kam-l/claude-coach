# Plugin Anatomy

Decision-tree reference for setup workflows. Load specific sections, not the whole file.

## Scripts

| Script | Mode | Purpose |
|--------|------|---------|
| `session-advisor.js` | Library + worker | Library: `getSessionAdvice()` for statusline. Worker: `claude -p --model sonnet` transcript analysis. |
| `prompt-enrichment.js` | Hook (5s timeout) | Groq/Anthropic classifier — routes ambiguous prompts to clarify/frustration/plan/recon directives. |
| `coach-inject.js` | Hook (2s timeout) | Injects advisor recommendations as `additionalContext` on UserPromptSubmit. |
| `install-statusline.js` | CLI (setup) | Creates runtime dir, writes version marker, cleans stale copies. |
| `mine-setup.js` | CLI (setup) | Scans commands/skills/hooks, calls Sonnet to produce `setup-context.md`. |
| `apply-tips.js` | CLI (setup) | Merges `tips.json` into `spinnerTipsOverride` in settings. `--project-dir` for project tips. |
| `statusline-tips.js` | Statusline | Returns random tip or advisor output. Registered as `statusLine` command. |
| `merge-tips.js` | CLI (maintenance) | Merges tip sources, deduplicates. |
| `helpers.js` | Library | `extractFrontmatter`, `findFiles`, `safeRead`, `safeJSON`. |

## Hooks

Registered in `hooks/hooks.json` under `UserPromptSubmit`:
1. `coach-inject.js` (2s timeout) — injects advisor context
2. `prompt-enrichment.js` (5s timeout) — classifies and enriches prompts

Both fail-open (exit 0 on error). Both skip subagents (`agent_id` check).

## Settings Touched

| Key | Location | Purpose |
|-----|----------|---------|
| `spinnerTipsEnabled` | `~/.claude/settings.json` | Enables custom spinner tips |
| `spinnerTipsOverride.tips` | `~/.claude/settings.json` | Array of tip strings |
| `statusLine` | `~/.claude/settings.json` | Command to run `statusline-tips.js` |
| `env.CLAUDE_COACH` | `~/.claude/settings.json` | Enable advisor (`1`/`0`) |
| `env.CLAUDE_COACH_INTERVAL` | `~/.claude/settings.json` | Advisor cycle seconds (default 900) |
| `env.CLAUDE_COACH_COSTS` | `~/.claude/settings.json` | Show cost in statusline |

## Env Vars

| Var | Source | Purpose |
|-----|--------|---------|
| `GROQ_API_KEY` | System env | Prompt enrichment (free tier) |
| `ANTHROPIC_API_KEY` | System env | Prompt enrichment fallback (Haiku) |
| `CLAUDE_COACH` | Settings env | Enable advisor |
| `CLAUDE_COACH_INTERVAL` | Settings env | Advisor cycle interval |
| `CLAUDE_COACH_COSTS` | Settings env | Show costs in statusline |

## Runtime (Mutable)

Location: `~/.claude/plugins/claude-coach/`

| Path | Purpose |
|------|---------|
| `version.json` | Version marker + install timestamp + source path |
| `setup-context.md` | Mined coaching context for advisor |
| `cache/` | Advisor cache (advice per session) |
| `enrichment-log.jsonl` | Enrichment debug log |

Legacy locations (cleaned during install): `~/.claude/.coach/`, `~/.claude/statusline-tips.js`

## Data (Immutable, bundled)

| Path | Purpose |
|------|---------|
| `tips.json` | 112 tips, 6 categories. Shape: `{ version, categories: { [name]: string[] } }` |
| `references/claude-usage.md` | Advisor knowledge base |

## Agents

| Agent | Role |
|-------|------|
| `adversary` | Universal stress-tester (used by /verify, uninstall) |
| `attacker` | Antithesis advocate (used by /verify -> /think) |
| `defender` | Thesis advocate (used by /verify -> /think) |
