---
description: >
  Review pending session reflections. Use when: /reflect, review reflections,
  pending reflections, session learnings, what did I learn, audit reflections,
  apply reflections, accept pending memories, what should I remember.
argument-hint: "[accept-all]"
---

Review pending session reflections — proposed memories and tips extracted from past sessions.

# Steps

1. Read pending reflections from the project JSONL:
   - Derive project slug from the current working directory: strip trailing slashes, replace `:`, `\`, `/` with `-`
   - Read `~/.claude/projects/{slug}/pending-reflections.jsonl` (one JSON object per line)
   - If file doesn't exist or is empty, tell the user and exit

2. For each pending reflection file, parse the JSON and **print as regular text output** (not inside AskUserQuestion):
   - Session timestamp and working directory
   - Extracted signals as a numbered list with tier label (correction / approval / observation)
   - Each proposed memory: name, type, and full content
   - Each proposed tip: the tip text verbatim

3. If `$ARGUMENTS` is "accept-all", apply all reflections without prompting (batch mode).

4. Otherwise, AFTER printing the content, use `AskUserQuestion` with a SHORT action-only prompt:
   - Question: "Action for this reflection?" (keep it short — all detail was already printed above)
   - **Accept all** — apply all proposed memories and tips from this reflection
   - **Cherry-pick** — show each memory/tip individually for accept/reject
   - **Skip** — discard this reflection entirely

   For cherry-pick mode, loop through each memory and tip with a separate AskUserQuestion:
   - Question: "Accept {name}?"
   - **Accept** / **Skip**

5. For accepted memories:
   - Derive project slug from the reflection's `cwd` field: strip trailing slashes, replace `:`, `\`, `/` with `-` (e.g., `C:\Projects\foo` → `C--Projects-foo`)
   - Write memory file to `~/.claude/projects/{project-slug}/memory/{name}.md`
   - Use frontmatter format: `name`, `description`, `type` fields
   - Update `~/.claude/projects/{project-slug}/memory/MEMORY.md` index with a link to the new file
   - Check for duplicates against existing MEMORY.md entries before writing

6. For accepted tips:
   - Display the tip and suggest the user run `/setup refresh` to include it

7. After processing, truncate `pending-reflections.jsonl` (clear the file).

# Anti-patterns
- Auto-applying without review — the whole point is human-in-the-loop
- Writing memories that duplicate existing ones — always check MEMORY.md first
- Writing to wrong memory directory — always derive slug from the reflection's cwd, not the current session's cwd
