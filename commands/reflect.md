---
description: >
  Review pending session reflections. Use when: /reflect, review reflections,
  pending reflections, session learnings, what did I learn, audit reflections,
  apply reflections, accept pending memories, what should I remember.
argument-hint: "[accept-all]"
---

Review pending session reflections — proposed memories and tips extracted from past sessions.

# Steps

1. Read pending reflections from `${CLAUDE_PLUGIN_DATA}/pending-reflections/*.json`. If no `CLAUDE_PLUGIN_DATA`, fallback to `~/.claude/plugins/claude-coach/pending-reflections/`. If none found, tell the user and exit.

2. For each pending reflection file, parse the JSON and display:
   - Session timestamp and working directory
   - Extracted signals with tier label (correction / approval / observation)
   - Proposed memories and tips

3. If `$ARGUMENTS` is "accept-all", apply all reflections without prompting (batch mode).

4. Otherwise, for each reflection use `AskUserQuestion` with choices:
   - **Accept all** — apply all proposed memories and tips from this reflection
   - **Cherry-pick** — show each memory/tip individually for accept/reject
   - **Skip** — discard this reflection entirely
   - **Edit** — user provides modified version via Other

5. For accepted memories:
   - Derive project slug from the reflection's `cwd` field: strip trailing slashes, replace `:`, `\`, `/` with `-` (e.g., `C:\Projects\foo` → `C--Projects-foo`)
   - Write memory file to `~/.claude/projects/{project-slug}/memory/{name}.md`
   - Use frontmatter format: `name`, `description`, `type` fields
   - Update `~/.claude/projects/{project-slug}/memory/MEMORY.md` index with a link to the new file
   - Check for duplicates against existing MEMORY.md entries before writing

6. For accepted tips:
   - Display the tip and suggest the user run `/setup refresh` to include it

7. After processing, delete the pending reflection files that were reviewed.

# Anti-patterns
- Auto-applying without review — the whole point is human-in-the-loop
- Writing memories that duplicate existing ones — always check MEMORY.md first
- Writing to wrong memory directory — always derive slug from the reflection's cwd, not the current session's cwd
