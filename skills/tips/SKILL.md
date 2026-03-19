---
description: "Session coach for Claude Code — curated spinner tips and live contextual advice. Triggers: 'tips', 'coach', 'update tips', 'new tips', 'setup tips', 'init tips', 'refresh tips', 'list tips', 'add tip', 'spinner tips', 'configure tips', 'uninstall tips', 'remove tips'."
argument-hint: "[init|refresh|list|add <tip>|uninstall]"
---

<constraints>
Tips = user advice: "Use /X to Y" or "When X, try Y". Never agent instructions.
Resolve `${CLAUDE_PLUGIN_ROOT}` as the directory containing `tips.json` — locate via the skill's own path or `find . -name tips.json -not -path "*/node_modules/*"`.
</constraints>

<routing>
`$ARGUMENTS` blank → `AskUserQuestion`: which mode? (init, refresh, list, add, uninstall)

| Action | Handler |
|--------|---------|
| `init` | → `workflows/init.md` — full first-time setup |
| `refresh` | → `workflows/refresh.md` — re-apply curated tips to spinner + update runtime |
| `list` | Read all tips from `${CLAUDE_PLUGIN_ROOT}/tips.json`. Print numbered by category. |
| `add <tip>` | Append `💡 <tip>` to the `custom` category in `${CLAUDE_PLUGIN_ROOT}/tips.json` (create category if absent). Verify JSON validity after write. Confirm. |
| `advisor` | → `workflows/init.md` step 2d — wire and optionally enable the session advisor (default: every 15 min) |
| `uninstall` | → `workflows/uninstall.md` — remove all traces of claude-coach |
</routing>
