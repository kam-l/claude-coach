# claude-coach

Session-aware coaching — curated spinner tips + live Sonnet advisor.

## Key Invariants

- `session-advisor.js` is dual-mode (library + worker). Both must work after edits.
- Worker calls `claude -p --model sonnet` — the one correct `claude -p` usage (standalone, no Claude Code context)
- Runtime files install to `~/.claude/.coach/` via `install-statusline.js` (decoupled from plugin cache)
- Env vars: `CLAUDE_COACH` (enable), `CLAUDE_COACH_INTERVAL` (seconds, default 900)

## Conventions

- Tips: `💡` prefix, max 80 chars, format "Use /X to Y" or "When X, try Y"
- `tips.json` shape: `{ version, categories: { [name]: string[] } }` — flat string arrays per category
