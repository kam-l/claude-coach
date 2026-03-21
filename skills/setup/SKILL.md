---
description: "Install, uninstall, refresh, or customize claude-coach. Use for: setup, first-time install, remove, reinstall, refresh tips, manage spinner, add custom tips, explain plugin, troubleshoot, configure advisor, or any question about how claude-coach works."
argument-hint: "[install|uninstall|refresh|customize]"
---

Route `$ARGUMENTS` to one workflow. If blank, `AskUserQuestion` with choices: Install, Uninstall, Refresh, Customize.

| Intent | Match | Workflow |
|--------|-------|----------|
| First-time setup or reinstall | install, init, setup, get started | `workflows/install.md` |
| Remove all traces | uninstall, remove, delete, clean | `workflows/uninstall.md` |
| Re-apply tips + update runtime | refresh, update, re-apply, rescan | `workflows/refresh.md` |
| Explain, list tips, add tips | explain, customize, list, add, how, tips, what is, anatomy | `workflows/customize.md` |

Read the matched workflow and follow its steps. Each workflow loads `references/plugin-anatomy.md` only when instructed.

## Invariants

- Stop on first error. Do not continue to subsequent steps.
- Remind user to **restart Claude Code** after install/uninstall/refresh.
