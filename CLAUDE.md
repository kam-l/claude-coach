# claude-coach

Session-aware coaching — curated spinner tips, live Sonnet advisor, frustration coaching, session reflection.

## Key Invariants

- `session-advisor.js` is dual-mode (library + worker). Both must work after edits.
- `session-advisor.js` MUST fallback `CLAUDE_PLUGIN_DATA` to `~/.claude/plugins/claude-coach/` — library mode callers (custom statusline) don't have the env var
- Worker calls `claude -p --model sonnet` — correct `claude -p` usage (standalone, no Claude Code context)
- `reflect-pipeline.js` calls `claude -p --model sonnet` once — runs detached after session ends
- Reflection pipeline: SessionEnd hook → single Sonnet call (extract signals + generate reflections) → pending JSONL
- Pending reflections: `~/.claude/projects/{slug}/pending-reflections.jsonl` — append-only, per-project, cleared by `/reflect`
- `prompt-enrichment.js` is frustration-only (local regex, no API calls, zero latency) — injects inline coaching, does NOT route to external commands
- Advisor NEVER suggests `/compact` or `/clear` for context management — `/clear` is fine for topic changes or repeated-correction recovery
- Statusline prefix: `💡` = random tip, `ℹ️` = advisor display, `⚠️` = advisor inject, `🔍` = analyzing, `💭` = pending reflections
- Statusline tip priority: ⚠️ inject-strength advice > 💭 pending reflections (always first if >0) > ℹ️ display-strength advice > 💡 random tip
- `install-statusline.js` ensures mutable runtime dir exists, cleans stale copies — `--wire` detects existing statusline and generates a universal aggregator wrapper (forks stdin to original command, appends coach output) at `${CLAUDE_PLUGIN_DATA}/statusline-aggregator.js`
- Data files (tips.json, references/claude-usage.md) are read from the bundle (`__dirname`) — never copied to runtime
- Mutable data (cache, logs, setup-context, pending-reflections) lives under `${CLAUDE_PLUGIN_DATA}`
- Env vars: `CLAUDE_COACH` (enable advisor), `CLAUDE_COACH_INTERVAL` (minutes, default 5), `CLAUDE_COACH_COSTS` (show cost in statusline)
- Env vars: `CLAUDE_COACH_DEBUG` (enable debug logging to `${CLAUDE_PLUGIN_DATA}/reflect-debug.log`)
- Plugin is self-reliant — no dependencies on global-scope agents or commands

## Reflection Pipeline

```
SessionEnd hook (reflect-hook.js) → detached child (reflect-pipeline.js)
  Gates: CLAUDE_PLUGIN_DATA exists, event=SessionEnd, transcript >10KB, no active lock
  Single Sonnet call: extract signals + generate memory patches + tips + CLAUDE.md/skill patches
  Output: ~/.claude/projects/{slug}/pending-reflections.jsonl (append)
  Statusline: 💭 shows pending count → /reflect to review
```

- Transcript is JSONL at `~/.claude/projects/{slug}/{session-id}.jsonl` — filter to `type: "user"` and `type: "assistant"`
- SessionEnd stdin fields: `session_id`, `transcript_path`, `cwd`, `hook_event_name`
- Single `claude -p --model sonnet` call (~10s latency, $0.05 budget cap)
- Lock file `reflect.lock` prevents concurrent pipelines; stale lock recovery after 5 min
- Sessions with no corrections/confirmations/feedback produce 0 signals — this is expected

## Commands & Skills

- `/setup [install|uninstall|refresh|customize]` — skill: install, remove, refresh tips, or explain plugin
- `/reflect [accept-all]` — review pending reflections: memories, tips, CLAUDE.md patches, skill patches
- After adding/changing commands: run `/setup refresh` to surface them as spinner tips
- Shared helpers in `scripts/helpers.js` — `extractFrontmatter`, `findFiles`, `safeRead`, `safeJSON`

## Conventions

- Tips: `💡` prefix, under 120 chars, format "Use /X to Y" or "When X, try Y"
- Project-specific tips: `[ProjectName]` suffix (basename of project dir)
- `tips.json` shape: `{ version, categories: { [name]: string[] } }` — flat string arrays per category
- Hooks fail-open: never block the user's prompt on error or missing config
