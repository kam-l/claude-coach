# Refresh Tips

Re-apply curated tips to spinner, re-mine setup context, update runtime files.

**If any step fails, stop and report the error. Do not proceed to subsequent steps.**

## 1. Apply tips to spinner

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-tips.js" --dry-run
```

`AskUserQuestion` with the dry-run output. After confirm:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-tips.js"
```

## 2. Update runtime files

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/install-statusline.js"
```

## 3. Re-mine setup context

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/mine-setup.js"
```

## 4. Verify

```bash
node -e "const d=JSON.parse(require('fs').readFileSync('${CLAUDE_PLUGIN_ROOT}/tips.json','utf-8')); const n=Object.values(d.categories).flat().length; console.log('tips.json: valid,', n, 'tips')"
```

Done when: `tips.json` is valid JSON and tip count is reported. Remind to restart Claude Code.
