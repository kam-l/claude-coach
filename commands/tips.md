---
description: "Manage spinner tips: list, add, or refresh (curated + project-specific)."
argument-hint: "[list|add <tip>|refresh]"
---

<routing>
`$ARGUMENTS` blank or starts with `list` → **List mode**
`$ARGUMENTS` starts with `add ` → **Add mode**
`$ARGUMENTS` starts with `refresh` → **Refresh mode**
Otherwise → `AskUserQuestion`: which mode? (list, add, refresh)
</routing>

## List mode

Read `${CLAUDE_PLUGIN_ROOT}/tips.json`. Print tips numbered by category:

```
### workflow (24 tips)
1. 💡 Start complex tasks in plan mode...
...
### context (20 tips)
...
```

## Add mode

Extract the tip text after `add `. Ensure `💡` prefix. Append to the `custom` category in `${CLAUDE_PLUGIN_ROOT}/tips.json` (create category if absent). Verify JSON validity after write. Confirm the addition.

## Refresh mode

Re-apply curated tips + generate project-specific tips + update runtime + re-mine context.

**If any step fails, stop and report the error. Do not proceed to subsequent steps.**

### 1. Apply tips to spinner (curated + project)

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-tips.js" --project-dir "${CLAUDE_PROJECT_ROOT:-$(pwd)}" --dry-run
```

`AskUserQuestion` with the dry-run output. After confirm:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/apply-tips.js" --project-dir "${CLAUDE_PROJECT_ROOT:-$(pwd)}"
```

### 2. Update runtime files

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/install-statusline.js"
```

### 3. Re-mine setup context

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/mine-setup.js"
```

### 4. Verify

```bash
node -e "const d=JSON.parse(require('fs').readFileSync('${CLAUDE_PLUGIN_ROOT}/tips.json','utf-8')); const n=Object.values(d.categories).flat().length; console.log('tips.json: valid,', n, 'tips')"
```

Done when: `tips.json` is valid JSON and tip count is reported. Remind to restart Claude Code.
