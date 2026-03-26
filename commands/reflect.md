---
description: >
  Review pending session reflections. Use when: /reflect, review reflections,
  pending reflections, session learnings, what did I learn, audit reflections,
  apply reflections, accept pending memories, what should I remember.
argument-hint: "[accept-all]"
---

Review pending session reflections — proposed memories, tips, CLAUDE.md patches, and skill patches extracted from past sessions.

# Steps

1. Read pending reflections from the project JSONL:
   - Derive project slug from the current working directory: strip trailing slashes, replace `:`, `\`, `/` with `-`
   - Resolve `$HOME` to the absolute home path. Read `{home}/.claude/projects/{slug}/pending-reflections.jsonl` (one JSON per line)
   - If file doesn't exist or is empty, tell the user and exit

2. For each pending reflection, parse the JSON and **print as regular text output** (not inside AskUserQuestion):
   - Session timestamp and working directory
   - Extracted signals as a numbered list with tier label (correction / approval / observation)
   - Each proposed item grouped by type:
     - **Memories**: name, type, and full content
     - **Tips**: the tip text verbatim
     - **CLAUDE.md patches**: target section and content to add
     - **Skill patches**: target skill, section, and content to add

3. If `$ARGUMENTS` is "accept-all", apply all reflections without prompting (batch mode).

4. Otherwise, AFTER printing the content, use `AskUserQuestion` with a SHORT action-only prompt:
   - Question: "Action for this reflection?" (keep it short — all detail was already printed above)
   - **Accept all** — apply all proposed items from this reflection
   - **Cherry-pick** — show each item individually for accept/reject
   - **Skip** — discard this reflection entirely

   For cherry-pick mode, loop through each item with a separate AskUserQuestion:
   - Question: "Accept {name/description}?"
   - **Accept** / **Edit** / **Skip**

5. For accepted memories:
   - Derive project slug from the reflection's `cwd` field: strip trailing slashes, replace `:`, `\`, `/` with `-` (e.g., `C:\Projects\foo` → `C--Projects-foo`)
   - Write memory file to `{home}/.claude/projects/{project-slug}/memory/{name}.md` (resolve `$HOME` to absolute path — Write tool doesn't expand tilde)
   - Use frontmatter format: `name`, `description`, `type` fields
   - Update `{home}/.claude/projects/{project-slug}/memory/MEMORY.md` index with a link to the new file
   - Check for duplicates against existing MEMORY.md entries before writing

6. For accepted tips:
   - Display the tip and suggest the user run `/setup refresh` to include it

7. For accepted CLAUDE.md patches:
   - Read the project's CLAUDE.md (from the reflection's `cwd`)
   - Find the target `## Section` heading
   - Append the patch content under that section (before the next `##` heading)
   - If section doesn't exist, create it at the appropriate position
   - Show the diff to the user before writing

8. For accepted skill patches:
   - Find the skill at `skills/{skill_name}/SKILL.md` (check both project and `{home}/.claude/skills/`)
   - Read the file, find the target section
   - Append the patch content under that section
   - If the skill or section doesn't exist, show the content and ask where to put it
   - Show the diff to the user before writing

9. After processing, truncate `pending-reflections.jsonl` (clear the file).

# Anti-patterns
- Auto-applying without review — the whole point is human-in-the-loop
- Writing memories that duplicate existing ones — always check MEMORY.md first
- Writing to wrong memory directory — always derive slug from the reflection's cwd, not the current session's cwd
- Blindly appending to CLAUDE.md without checking for duplicates or contradictions
- Patching a skill without reading it first — the patch may be redundant or conflict
