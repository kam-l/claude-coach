# claude-coach

Session-aware coaching — curated spinner tips, live Sonnet advisor, prompt enrichment.

## Key Invariants

- `session-advisor.js` is dual-mode (library + worker). Both must work after edits.
- Worker calls `claude -p --model sonnet` — the one correct `claude -p` usage (standalone, no Claude Code context)
- `prompt-enrichment.js` calls Groq/Anthropic API directly (NOT `claude -p` — too slow for sync hooks)
- Runtime files install to `~/.claude/plugins/claude-coach/` via `install-statusline.js` (decoupled from plugin cache)
- All artifacts (cache, logs, tips, advisor state) live under `~/.claude/plugins/claude-coach/`
- Env vars: `CLAUDE_COACH` (enable advisor), `CLAUDE_COACH_INTERVAL` (seconds, default 900)
- Env vars: `GROQ_API_KEY` (prompt enrichment, free), `ANTHROPIC_API_KEY` (fallback, paid)

## Conventions

- Tips: `💡` prefix, max 80 chars, format "Use /X to Y" or "When X, try Y"
- `tips.json` shape: `{ version, categories: { [name]: string[] } }` — flat string arrays per category
- Hooks fail-open: never block the user's prompt on error or missing config
