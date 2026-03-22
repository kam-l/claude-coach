# Install

Full first-time setup: spinner tips, runtime, setup-context mining, statusline, advisor.

**Required reading:** `references/plugin-anatomy.md` (sections: Scripts, Settings touched, Runtime).

**Stop on first error.**

## 1. Apply spinner tips

Preview:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-tips.js" --project-dir "${CLAUDE_PROJECT_ROOT:-$(pwd)}" --dry-run
```

`AskUserQuestion` with output. After confirm:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-tips.js" --project-dir "${CLAUDE_PROJECT_ROOT:-$(pwd)}"
```

## 2. Prepare runtime

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/install-statusline.js"
```

Clean legacy location:
```bash
node -e "try { require('fs').unlinkSync(require('path').join(require('os').homedir(), '.claude', 'statusline-tips.js')); console.log('removed legacy'); } catch {}"
```

## 3. Mine setup context

Scans user's commands, skills, hooks. Uses Sonnet (~$0.05-0.10 one-time).
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/mine-setup.js"
```

`AskUserQuestion` with output -- user verifies it looks reasonable.

## 4. Wire statusline

Check `statusLine` in `.claude/settings.local.json` -> `.claude/settings.json` -> `~/.claude/settings.json` (first wins).

| State | Action |
|-------|--------|
| Prior claude-coach version (regex: `/statusline-tip\|session-advisor/`) | Replace `statusLine` command with new path |
| Unrelated script exists | Do NOT replace. Read target script first. Append coach require + tip output. `AskUserQuestion` with diff before editing. |
| No statusline | Register in `~/.claude/settings.json`: `"statusLine": {"type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/statusline-tips.js\""}` |

## 5. Advisor (optional)

`AskUserQuestion`: "Enable session advisor? Analyzes transcript every 15 min via `claude -p --model sonnet`. Cost: ~$0.10-0.18/cycle. Configurable via `CLAUDE_COACH_INTERVAL` (seconds, default 900)."
- Yes: set `CLAUDE_COACH=1` in `~/.claude/settings.json` under `env`
- No: statusline works, falls back to random tips

## 6. Verify

```bash
node -e "
const fs = require('fs'), path = require('path'), os = require('os');
const coachDir = process.env.CLAUDE_PLUGIN_DATA;
console.log(fs.existsSync(path.join(coachDir, 'version.json')) ? 'runtime: OK' : 'runtime: MISSING');
const settings = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf-8'));
console.log(settings.spinnerTipsOverride?.tips?.length ? 'spinner: ' + settings.spinnerTipsOverride.tips.length + ' tips' : 'spinner: MISSING');
"
```

Done when all checks pass. **Restart Claude Code** to load changes.
