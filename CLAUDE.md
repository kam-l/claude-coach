# claude-coach

Session-aware coaching — curated spinner tips, live Sonnet advisor, prompt enrichment.

## Key Invariants

- `session-advisor.js` is dual-mode (library + worker). Both must work after edits.
- Worker calls `claude -p --model sonnet` — the one correct `claude -p` usage (standalone, no Claude Code context)
- `prompt-enrichment.js` calls Groq/Anthropic API directly (NOT `claude -p` — too slow for sync hooks)
- `prompt-enrichment.js` must skip advisor prompts (starts with "Analyze a Claude Code session transcript")
- Advisor NEVER suggests `/compact` or `/clear` for context management — `/clear` is fine for topic changes or repeated-correction recovery
- Statusline prefix: `💡` = random tip, `ℹ️` = advisor display, `⚠️` = advisor inject, `🔍` = analyzing
- `install-statusline.js` ensures mutable runtime dir exists, cleans stale copies — scripts run from plugin cache
- Data files (tips.json, claude-usage.md) are read from the bundle (`__dirname`) — never copied to runtime
- Mutable data (cache, logs, setup-context) lives under `~/.claude/plugins/claude-coach/`
- Env vars: `CLAUDE_COACH` (enable advisor), `CLAUDE_COACH_INTERVAL` (seconds, default 900), `CLAUDE_COACH_COSTS` (show cost in statusline)
- Env vars: `GROQ_API_KEY` (prompt enrichment, free), `ANTHROPIC_API_KEY` (fallback, paid)

## Commands & Skills

- `/setup [install|uninstall|refresh|customize]` — skill: install, remove, refresh tips, or explain plugin
- `/verify [target]` — only user-callable command; auto-escalates to challenge, refine, or think
- `/question`, `/challenge`, `/refine`, `/think` — internal (called by enrichment or /verify, no description = hidden from tips)
- After adding/changing commands: run `/setup refresh` to surface them as spinner tips
- Shared helpers in `scripts/helpers.js` — `extractFrontmatter`, `findFiles`, `safeRead`, `safeJSON`

## Conventions

- Tips: `💡` prefix, max 80 chars, format "Use /X to Y" or "When X, try Y"
- Project-specific tips: `[ProjectName]` suffix (basename of project dir)
- `tips.json` shape: `{ version, categories: { [name]: string[] } }` — flat string arrays per category
- Hooks fail-open: never block the user's prompt on error or missing config
