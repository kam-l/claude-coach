# Refresh

Re-apply curated + project-specific tips, update runtime, re-mine setup context.

**Stop on first error.**

## 1. Apply tips

Preview:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-tips.js" --project-dir "${CLAUDE_PROJECT_ROOT:-$(pwd)}" --dry-run
```

`AskUserQuestion` with output. After confirm:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-tips.js" --project-dir "${CLAUDE_PROJECT_ROOT:-$(pwd)}"
```

## 2. Update runtime

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

Done when tip count reported. **Restart Claude Code** to load changes.
