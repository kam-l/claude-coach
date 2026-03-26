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

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/install-statusline.js" --wire
```

The script detects existing statusline configs (ccstatusline, claude-hud, prior claude-coach, custom scripts) and acts accordingly. Report the JSON output to the user. If `success: false`, share the action message — it contains manual integration instructions.

## 5. Advisor (optional)

`AskUserQuestion`: "Enable session advisor? Analyzes transcript every 5 min via `claude -p --model sonnet`. Cost: ≤$0.05/call. Configurable via `CLAUDE_COACH_INTERVAL` (minutes, default 5)."
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
