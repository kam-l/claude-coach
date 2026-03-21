# Uninstall — Remove claude-coach

Removes spinner tips, statusline wiring, advisor config, runtime files, and the plugin itself.

**`AskUserQuestion`**: "This will remove all claude-coach traces: spinner tips, statusline advisor, hooks, env vars, runtime files, and the plugin registration. Continue?"

## 1. Remove spinner tips from settings

Read `~/.claude/settings.json`. Remove `spinnerTipsEnabled` and `spinnerTipsOverride` keys. Write back.

Check project-level files too (`.claude/settings.json`, `.claude/settings.local.json`) — remove the same keys if present.

## 2. Remove statusline wiring

Check `statusLine` in `~/.claude/settings.json` → `.claude/settings.json` → `.claude/settings.local.json`.

- **Read the statusLine script file first** — check if it has logic beyond claude-coach
- If the script ONLY does claude-coach (e.g. `statusline-tips.js`): remove the `statusLine` key
- If the script has other logic and requires claude-coach (e.g. `~/.claude/statusline.js` with `require(...session-advisor)`): remove only the claude-coach require and output lines, leave the rest intact. Show diff via `AskUserQuestion` before editing.
- **NEVER delete statusLine without reading the target script first**

## 3. Remove runtime files

Remove both current and legacy runtime locations:
```bash
node -e "
const fs = require('fs'), path = require('path'), home = require('os').homedir();
const dirs = [
  path.join(home, '.claude', 'plugins', 'claude-coach'),
  path.join(home, '.claude', '.coach'),
];
for (const d of dirs) {
  try { fs.rmSync(d, { recursive: true, force: true }); console.log('removed', d); } catch {}
}
// Legacy statusline file
try { fs.unlinkSync(path.join(home, '.claude', 'statusline-tips.js')); console.log('removed legacy statusline'); } catch {}
"
```

## 4. Remove env vars

Read `~/.claude/settings.json`. Remove these keys from `env` if present:
- `CLAUDE_COACH`
- `CLAUDE_COACH_INTERVAL`

Write back.

## 5. Remove hooks registered by claude-coach

Read `~/.claude/settings.json`. In the `hooks` object, remove any hook entries whose `command` contains `claude-coach` or `CLAUDE_PLUGIN_ROOT`. Write back.

**Do NOT remove hooks that don't reference claude-coach.**

## 6. Uninstall plugin

```bash
claude plugin uninstall claude-coach
```

If that fails, remove manually:
- Delete `~/.claude/plugins/cache/claude-coach/`
- Delete `~/.claude/plugins/cache/kam-l-plugins/claude-coach/`
- Remove claude-coach entries from `~/.claude/plugins/installed_plugins.json`
- Remove claude-coach entries from `enabledPlugins` in `~/.claude/settings.json`

## 7. Verify — adversarial sweep

Spawn an `adversary` agent to verify the uninstall is complete:

> Verify that claude-coach has been fully removed from `~/.claude/`. Check:
> 1. `settings.json` — no `spinnerTipsOverride`, `spinnerTipsEnabled`, `statusLine` referencing claude-coach, `CLAUDE_COACH` env vars, or hooks referencing claude-coach/CLAUDE_PLUGIN_ROOT
> 2. `~/.claude/plugins/cache/` — no `claude-coach` directories
> 3. `~/.claude/plugins/claude-coach/` — does not exist
> 4. `~/.claude/.coach/` — does not exist
> 5. `~/.claude/statusline-tips.js` — does not exist
>
> Report any remaining traces as CRITICAL findings. Output `Result: PASS` if clean.

If the adversary finds traces, fix them and re-run until `PASS`.

## 8. Confirm

Tell the user: **Restart Claude Code** to complete removal. Spinner will revert to default tips.
