# Plugin Anatomy

Decision-tree reference for setup workflows. Load specific sections, not the whole file.

## Scripts

| Script | Mode | Purpose |
|--------|------|---------|
| `session-advisor.js` | Library + worker | Library: `getSessionAdvice()` for statusline (priority: ⚠️ inject > 💭 pending reflections > ℹ️ display > 💡 random tip). Worker: `claude -p --model sonnet` transcript analysis. |
| `prompt-enrichment.js` | Hook (2s timeout) | Frustration detection (local regex, no API) — injects coaching directive on user frustration. |
| `coach-inject.js` | Hook (2s timeout) | Injects advisor recommendations as `additionalContext` on UserPromptSubmit. |
| `install-statusline.js` | CLI (setup) | Creates runtime dir, writes version marker, cleans stale copies. |
| `mine-setup.js` | CLI (setup) | Scans commands/skills/hooks, calls Sonnet to produce `setup-context.md`. |
| `apply-tips.js` | CLI (setup) | Merges `tips.json` into `spinnerTipsOverride` in settings. `--project-dir` for project tips. |
| `statusline-tips.js` | Statusline | Returns random tip or advisor output. Registered as `statusLine` command. |
| `merge-tips.js` | CLI (maintenance) | Merges tip sources, deduplicates. |
| `error-logger.js` | Hook (2s timeout) | Logs tool/API failures to `errors.jsonl`. Injects coaching on repeated tool failures. |
| `helpers.js` | Library | `extractFrontmatter`, `findFiles`, `safeRead`, `safeJSON`. |

## Hooks

Registered in `hooks/hooks.json`:

**UserPromptSubmit:**
1. `coach-inject.js` (2s timeout) — injects advisor context
2. `prompt-enrichment.js` (2s timeout) — frustration detection, injects coaching directive

**PostToolUseFailure:**
3. `error-logger.js` (2s timeout) — logs tool failures, injects coaching on repeated failures

**StopFailure:**
4. `error-logger.js` (2s timeout) — logs API errors (observability only, output ignored)

All fail-open (exit 0 on error). UserPromptSubmit hooks skip subagents (`agent_id` check).

## Settings Touched

| Key | Location | Purpose |
|-----|----------|---------|
| `spinnerTipsEnabled` | `~/.claude/settings.json` | Enables custom spinner tips |
| `spinnerTipsOverride.tips` | `~/.claude/settings.json` | Array of tip strings |
| `statusLine` | `~/.claude/settings.json` | Command to run `statusline-tips.js` |
| `env.CLAUDE_COACH` | `~/.claude/settings.json` | Enable advisor (`1`/`0`) |
| `env.CLAUDE_COACH_INTERVAL` | `~/.claude/settings.json` | Advisor interval in minutes (default 5) |
| `env.CLAUDE_COACH_COSTS` | `~/.claude/settings.json` | Show cost in statusline |

## Env Vars

| Var | Source | Purpose |
|-----|--------|---------|
| `CLAUDE_COACH` | Settings env | Enable advisor |
| `CLAUDE_COACH_INTERVAL` | Settings env | Advisor cycle interval |
| `CLAUDE_COACH_COSTS` | Settings env | Show costs in statusline |

## Runtime (Mutable)

Location: `${CLAUDE_PLUGIN_DATA}`

| Path | Purpose |
|------|---------|
| `version.json` | Version marker + install timestamp + source path |
| `setup-context.md` | Mined coaching context for advisor |
| `cache/` | Advisor cache (advice per session) |
| `enrichment-log.jsonl` | Enrichment debug log |
| `errors.jsonl` | Tool + API error log for advisor analysis |

Legacy locations (cleaned during install): `~/.claude/.coach/`, `~/.claude/statusline-tips.js`

## Data (Immutable, bundled)

| Path | Purpose |
|------|---------|
| `tips.json` | 133 tips, 6 categories. Shape: `{ version, categories: { [name]: string[] } }` |
| `references/claude-usage.md` | Advisor knowledge base |

## Statusline Priority

1. **⚠️ inject** — urgent advisor advice (session-specific, actionable now)
2. **💭 pending reflections** — always shown if >0, first tip on new session
3. **ℹ️ display** — advisor advice worth showing, not urgent
4. **💡 random tip** — curated tip from pool, rotates every 30s
