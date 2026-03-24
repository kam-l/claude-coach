# claude-coach

Session-aware coaching — curated spinner tips, live Sonnet advisor, prompt enrichment, session reflection.

## Key Invariants

- `session-advisor.js` is dual-mode (library + worker). Both must work after edits.
- `session-advisor.js` MUST fallback `CLAUDE_PLUGIN_DATA` to `~/.claude/plugins/claude-coach/` — library mode callers (custom statusline) don't have the env var
- Worker calls `claude -p --model sonnet` — correct `claude -p` usage (standalone, no Claude Code context)
- `reflect-pipeline.js` calls `claude -p --model haiku` then `claude -p --model sonnet` — runs detached after session ends
- Reflection pipeline: Stop hook → Haiku extract signals → Sonnet generate reflections → pending JSON queue
- Pending reflections live in `${CLAUDE_PLUGIN_DATA}/pending-reflections/` — never auto-applied
- Stop hook fires per subagent too — `reflect-hook.js` deduplicates via `agent_id` field (present on subagents, absent on main session)
- `prompt-enrichment.js` is frustration-only (local regex, no API calls, zero latency)
- Advisor NEVER suggests `/compact` or `/clear` for context management — `/clear` is fine for topic changes or repeated-correction recovery
- Statusline prefix: `💡` = random tip, `ℹ️` = advisor display, `⚠️` = advisor inject, `🔍` = analyzing, `💭` = pending reflections
- `install-statusline.js` ensures mutable runtime dir exists, cleans stale copies — scripts run from plugin cache
- Data files (tips.json, claude-usage.md) are read from the bundle (`__dirname`) — never copied to runtime
- Mutable data (cache, logs, setup-context, pending-reflections) lives under `${CLAUDE_PLUGIN_DATA}`
- Env vars: `CLAUDE_COACH` (enable advisor), `CLAUDE_COACH_INTERVAL` (minutes, default 5), `CLAUDE_COACH_COSTS` (show cost in statusline)
- Env vars: `CLAUDE_COACH_DEBUG` (enable debug logging to `${CLAUDE_PLUGIN_DATA}/reflect-debug.log`)
- Env vars: `GROQ_API_KEY` and `ANTHROPIC_API_KEY` no longer required (API classifier removed)

## Reflection Pipeline

```
Stop hook (reflect-hook.js) → detached child (reflect-pipeline.js)
  Gates: CLAUDE_PLUGIN_DATA exists, event=Stop, no agent_id, transcript >10KB, no active lock
  Stage 1: Haiku extracts signals (correction > approval > observation)
  Stage 2: Sonnet generates memory patches + tips (only if signals found)
  Output: ${CLAUDE_PLUGIN_DATA}/pending-reflections/{timestamp}.json
  Statusline: 💭 shows pending count → /reflect to review
```

- Transcript is JSONL at `~/.claude/projects/{slug}/{session-id}.jsonl` — filter to `type: "user"` and `type: "assistant"`
- Stop stdin fields: `session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`, `stop_hook_active`, `last_assistant_message`
- `claude -p` works from detached subprocess post-teardown (~9s Haiku latency)
- Cost ceiling: ~$0.05/session (cumulative Haiku budget $0.04, Sonnet $0.04 per-call cap)
- Lock file `reflect.lock` prevents concurrent pipelines; stale lock recovery after 5 min
- Sessions with no corrections/confirmations/feedback produce 0 signals — this is expected

## Commands & Skills

- `/setup [install|uninstall|refresh|customize]` — skill: install, remove, refresh tips, or explain plugin
- `/verify [target]` — user-callable command; auto-escalates to challenge, refine, or think
- `/reflect [accept-all]` — review pending session reflections; accept/reject/edit proposed memories and tips
- `/question`, `/challenge`, `/refine`, `/think` — internal (called by enrichment or /verify, no description = hidden from tips)
- After adding/changing commands: run `/setup refresh` to surface them as spinner tips
- Shared helpers in `scripts/helpers.js` — `extractFrontmatter`, `findFiles`, `safeRead`, `safeJSON`

## Conventions

- Tips: `💡` prefix, under 120 chars, format "Use /X to Y" or "When X, try Y"
- Project-specific tips: `[ProjectName]` suffix (basename of project dir)
- `tips.json` shape: `{ version, categories: { [name]: string[] } }` — flat string arrays per category
- Hooks fail-open: never block the user's prompt on error or missing config
