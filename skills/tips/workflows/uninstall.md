# Uninstall — Remove claude-coach

Removes spinner tips, statusline wiring, advisor config, and the plugin itself.

**`AskUserQuestion`**: "This will remove all claude-coach traces: spinner tips, statusline advisor, and the plugin registration. Continue?"

## 1. Remove spinner tips from settings

Read `~/.claude/settings.json`. Remove `spinnerTipsEnabled` and `spinnerTipsOverride` keys. Write back.

Check project-level files too (`.claude/settings.json`, `.claude/settings.local.json`) — remove the same keys if present.

## 2. Remove statusline wiring

Check `statusLine` in `~/.claude/settings.json` → `.claude/settings.json` → `.claude/settings.local.json`.

- If the statusline command references `.coach/statusline-tips` or `session-advisor`: remove the `statusLine` key from settings
- Also check for old path `~/.claude/statusline-tips.js` — remove if found
- If the statusline script has other logic besides claude-coach: remove only the claude-coach require and output lines, leave the rest intact. Show diff via `AskUserQuestion` before editing.

## 3. Remove runtime files

```bash
node -e "require('fs').rmSync(require('path').join(require('os').homedir(), '.claude', '.coach'), { recursive: true, force: true }); console.log('removed ~/.claude/.coach/')"
```

Also remove legacy statusline file if it exists:
```bash
node -e "try { require('fs').unlinkSync(require('path').join(require('os').homedir(), '.claude', 'statusline-tips.js')); console.log('removed old ~/.claude/statusline-tips.js'); } catch {}"
```

## 4. Remove advisor env var

Read `~/.claude/settings.json`. If `env.CLAUDE_COACH` exists, remove it. Write back.

## 5. Uninstall plugin

```bash
claude plugin uninstall claude-coach
```

If that fails, remove manually:
- Delete `~/.claude/plugins/cache/kam-l-plugins/claude-coach/`
- Remove `claude-coach@kam-l-plugins` from `~/.claude/plugins/installed_plugins.json`
- Remove `claude-coach@kam-l-plugins` from `enabledPlugins` in `~/.claude/settings.json`

## 6. Uninstall npm package (if present)

```bash
npm uninstall -g @kam-l/claude-coach
```

## 7. Confirm

Tell the user: **Restart Claude Code** to complete removal. Spinner will revert to default tips.
