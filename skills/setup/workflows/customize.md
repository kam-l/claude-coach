# Customize

Explain plugin anatomy, list tips, or add custom tips.

## Routing

| Intent | Keywords | Action |
|--------|----------|--------|
| Explain plugin | explain, how, anatomy, architecture, what is | **Explain mode** |
| List tips | list, show, tips | **List mode** |
| Add a tip | add | **Add mode** |

If ambiguous, `AskUserQuestion` with choices: Explain, List tips, Add tip.

## List mode

Read `${CLAUDE_PLUGIN_ROOT}/tips.json`. Print numbered by category:

```
### workflow (24 tips)
1. ... 2. ...
### context (20 tips)
...
```

## Add mode

Extract tip text from arguments (after "add"). Ensure `💡` prefix, max 80 chars. Append to `custom` category in `${CLAUDE_PLUGIN_ROOT}/tips.json` (create category if absent). Verify JSON validity after write. Confirm.

## Explain mode

Read `references/plugin-anatomy.md`. Summarize the relevant section based on user's question. If general, give the overview:
- What each script does and when it runs
- What hooks are registered
- What settings are modified and where
- What env vars control behavior

Answer the specific question, don't dump the entire reference.
