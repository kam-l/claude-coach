# Init — Full Setup

One-time setup: apply curated tips to spinner, mine setup context, wire Sonnet session advisor.

**If any step fails, stop and report the error. Do not proceed to subsequent steps.**

**Required reading:** `${CLAUDE_PLUGIN_ROOT}/tips.json` (understand category structure before modifying).

## 1. Apply tips to spinner

Preview first:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-tips.js" --project-dir "${CLAUDE_PROJECT_ROOT:-$(pwd)}" --dry-run
```

`AskUserQuestion` with the dry-run output. After confirm:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-tips.js" --project-dir "${CLAUDE_PROJECT_ROOT:-$(pwd)}"
```

## 2a. Install runtime files

This copies statusline + advisor + miner into `~/.claude/.coach/` (decoupled from plugin cache):
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/install-statusline.js"
```

Clean up old statusline location if it exists:
```bash
node -e "try { require('fs').unlinkSync(require('path').join(require('os').homedir(), '.claude', 'statusline-tips.js')); console.log('removed old ~/.claude/statusline-tips.js'); } catch {}"
```

## 2b. Mine setup context

Scans the user's commands, skills, hooks, and friction (global + project). Uses Sonnet to produce a compact coaching reference (~$0.05-0.10 one-time cost).
```bash
node "${HOME}/.claude/.coach/mine-setup.js"
```

Show the output to the user via `AskUserQuestion` — they should verify it looks reasonable.

## 2c. Register statusline in settings

Check `statusLine` in `.claude/settings.local.json` → `.claude/settings.json` → `~/.claude/settings.json` (first wins).

**Prior plugin version** → Detect via regex: `/statusline-tip|session-advisor/`. Replace the `statusLine` command with the new path (below).

**Unrelated script exists** → do NOT replace. Append tip output:
- Add at top: `const { getSessionAdvice } = require(require("path").join(require("os").homedir(), ".claude", ".coach", "session-advisor"));`
- Append tip as an additional output line after existing output
- `AskUserQuestion` with before/after diff. Edit only after confirm.

**No existing statusline** → register in `~/.claude/settings.json`:
```json
"statusLine": {"type": "command", "command": "node {HOME}/.claude/.coach/statusline-tips.js"}
```
Use the resolved home directory path, not `~`.

## 2d. Enable advisor (optional)

`AskUserQuestion`: "Enable session advisor? Analyzes your session transcript every 15 min and shows contextual tips. Each cycle spawns `claude -p` (~9K content tokens + system prompt overhead). Estimated cost: ~$0.10-0.18/cycle → ~$0.40-0.72/hour at Sonnet pricing. Configurable via `CLAUDE_COACH_INTERVAL` (seconds, default 900)."
- If yes: set `CLAUDE_COACH=1` in `~/.claude/settings.json` under `env`
- If no: statusline still works, falls back to random tips from `tips.json`

## 3. Verify

```bash
node -e "
const fs = require('fs'), path = require('path'), os = require('os');
const coachDir = path.join(os.homedir(), '.claude', '.coach');
console.log(fs.existsSync(path.join(coachDir, 'session-advisor.js')) ? 'runtime: installed' : 'runtime: MISSING');
console.log(fs.existsSync(path.join(coachDir, 'tips.json')) ? 'tips.json: copied' : 'tips.json: MISSING');
console.log(fs.existsSync(path.join(coachDir, 'setup-context.md')) ? 'setup-context: mined' : 'setup-context: MISSING');
const paths = [
  path.join(os.homedir(), '.claude', 'settings.json'),
  path.join(process.cwd(), '.claude', 'settings.json'),
  path.join(process.cwd(), '.claude', 'settings.local.json')
];
const found = paths.find(p => { try { return JSON.parse(fs.readFileSync(p,'utf-8')).spinnerTipsEnabled; } catch { return false; } });
console.log(found ? 'spinner: configured (' + found + ')' : 'spinner: missing');
"
```

Done when all checks pass.

## 4. Remind

Tell the user: **Restart Claude Code** (`/exit` then relaunch) to load spinner tips and statusline changes.
