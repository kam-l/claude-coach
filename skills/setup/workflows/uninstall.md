# Uninstall

Remove all claude-coach traces: spinner tips, statusline, advisor, hooks, runtime, plugin.

**Required reading:** `references/plugin-anatomy.md` (sections: Settings touched, Runtime, Env vars).

**Stop on first error.**

## Confirm

`AskUserQuestion`: "This removes all claude-coach traces: spinner tips, statusline, advisor, hooks, env vars, runtime, and the plugin. Continue?"

## 1. Remove spinner tips

Read `~/.claude/settings.json`. Remove `spinnerTipsEnabled` and `spinnerTipsOverride` keys. Write back.
Check project-level too (`.claude/settings.json`, `.claude/settings.local.json`) -- remove same keys if present.

## 2. Remove statusline wiring

Check `statusLine` in `~/.claude/settings.json` -> `.claude/settings.json` -> `.claude/settings.local.json`.

- **Read the target script first** -- check if it has logic beyond claude-coach
- Coach-only script (e.g. `statusline-tips.js`): remove the `statusLine` key
- Mixed script: remove only coach lines, leave rest. `AskUserQuestion` with diff before editing.
- **NEVER delete statusLine without reading the target script first**

Also clean up ccstatusline integration if present:
```bash
node -e "
const fs = require('fs'), path = require('path'), home = require('os').homedir();
const configPath = path.join(home, '.config', 'ccstatusline', 'settings.json');
try {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  let changed = false;
  if (config.lines) {
    for (const line of config.lines) {
      if (Array.isArray(line.items)) {
        const before = line.items.length;
        line.items = line.items.filter(i => !JSON.stringify(i).includes('claude-coach'));
        if (line.items.length < before) changed = true;
      }
    }
  }
  if (changed) { fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n'); console.log('removed claude-coach widget from ccstatusline config'); }
  else console.log('no claude-coach widget in ccstatusline config');
} catch { console.log('no ccstatusline config found'); }
"
```

## 3. Remove runtime

```bash
node -e "
const fs = require('fs'), path = require('path'), home = require('os').homedir();
for (const d of [
  process.env.CLAUDE_PLUGIN_DATA,
  path.join(home, '.claude', 'plugins', 'claude-coach'),
  path.join(home, '.claude', '.coach'),
].filter(Boolean)) { try { fs.rmSync(d, { recursive: true, force: true }); console.log('removed', d); } catch {} }
try { fs.unlinkSync(path.join(home, '.claude', 'statusline-tips.js')); console.log('removed legacy'); } catch {}
"
```

## 4. Remove env vars

Read `~/.claude/settings.json`. Remove from `env`: `CLAUDE_COACH`, `CLAUDE_COACH_INTERVAL`. Write back.

## 5. Remove hooks

Read `~/.claude/settings.json`. Remove hook entries whose `command` contains `claude-coach` or `CLAUDE_PLUGIN_ROOT`. Do NOT remove unrelated hooks. Write back.

## 6. Uninstall plugin

```bash
claude plugin uninstall claude-coach
```

If fails, remove manually: delete `~/.claude/plugins/cache/claude-coach/` and `~/.claude/plugins/cache/kam-l-plugins/claude-coach/`, remove from `installed_plugins.json` and `enabledPlugins`.

## 7. Verify

Spawn `adversary` (foreground):
> Verify claude-coach fully removed from `~/.claude/`. Check: settings.json (no spinnerTipsOverride, spinnerTipsEnabled, statusLine referencing coach, CLAUDE_COACH env vars, hooks referencing coach), no plugin cache dirs, no runtime dirs, no legacy statusline. Report traces as CRITICAL. Output `Result: PASS` if clean.

Fix traces and re-run until PASS. **Restart Claude Code** to complete removal.
