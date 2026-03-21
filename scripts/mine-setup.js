#!/usr/bin/env node
/**
 * Mines the local Claude Code setup and uses Sonnet to produce
 * a compact coaching reference for the session advisor.
 *
 * Output: ~/.claude/plugins/claude-coach/setup-context.md
 * Run at: install/refresh time (not every advisor cycle)
 *
 * Cost: one `claude -p --model sonnet` call (~$0.05-0.10)
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const { safeJSON, extractFrontmatter, findFiles } = require("./helpers");

const home = os.homedir();
const claudeHome = path.join(home, ".claude");
const projectDir = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
const dest = path.join(claudeHome, "plugins", "claude-coach", "setup-context.md");

// --- Helpers (script-specific) ---

function resolveClaudePath() {
  const cmd = process.platform === "win32" ? "where" : "which";
  try {
    const result = spawnSync(cmd, ["claude"], {
      encoding: "utf-8", timeout: 5000, windowsHide: true,
    });
    const firstLine = (result.stdout || "").split("\n")[0].trim();
    if (firstLine) return firstLine;
  } catch {}
  return "claude";
}

// --- Collect raw data ---

// Commands (global + project)
const commands = [];
const commandDirs = [
  path.join(claudeHome, "commands"),
  path.join(projectDir, ".claude", "commands"),
];
for (const dir of commandDirs) {
  for (const file of findFiles([dir], "*.md")) {
    const name = path.basename(file, ".md");
    const content = fs.readFileSync(file, "utf-8").replace(/\r\n/g, "\n");
    const fm = extractFrontmatter(content);
    commands.push({ name: `/${name}`, description: fm.description || "" });
  }
}

// Skills (global + project, deduplicated, user-invocable only)
const seen = new Set();
const skills = [];
const skillDirs = [
  path.join(claudeHome, "skills"),
  path.join(claudeHome, "plugins", "cache"),
  path.join(projectDir, ".claude", "skills"),
  path.join(projectDir, "skills"),
];
for (const dir of skillDirs) {
  for (const file of findFiles([dir], "SKILL.md")) {
    const name = path.basename(path.dirname(file));
    if (seen.has(name)) continue;
    seen.add(name);
    const content = fs.readFileSync(file, "utf-8").replace(/\r\n/g, "\n");
    const fm = extractFrontmatter(content);
    if (fm["user-invocable"] === "false") continue;
    skills.push({ name, description: fm.description || "" });
  }
}

// Hooks (global + project settings)
const hooks = [];
const seenHooks = new Set();
for (const sp of [
  path.join(claudeHome, "settings.json"),
  path.join(claudeHome, "settings.local.json"),
  path.join(projectDir, ".claude", "settings.json"),
  path.join(projectDir, ".claude", "settings.local.json"),
]) {
  const settings = safeJSON(sp);
  if (!settings || !settings.hooks) continue;
  for (const [event, handlers] of Object.entries(settings.hooks)) {
    if (!Array.isArray(handlers)) continue;
    for (const h of handlers) {
      const key = `${event}${h.matcher ? " → " + h.matcher : ""}`;
      if (seenHooks.has(key)) continue;
      seenHooks.add(key);
      hooks.push(key);
    }
  }
}

// Friction / insights (recent facets)
const friction = [];
const facetsDir = path.join(claudeHome, "usage-data", "facets");
try {
  if (fs.existsSync(facetsDir)) {
    const files = fs.readdirSync(facetsDir)
      .filter(f => f.endsWith(".json"))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(facetsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 5);
    for (const { name } of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(facetsDir, name), "utf-8"));
        if (data.underlying_goal || data.friction_detail) {
          friction.push({
            goal: data.underlying_goal || "",
            friction: data.friction_detail || "",
            outcome: data.outcome || "",
          });
        }
      } catch {}
    }
  }
} catch {}

// --- Short-circuit if nothing to mine ---

if (commands.length === 0 && skills.length === 0 && friction.length === 0) {
  console.log("Nothing to mine yet — no commands, skills, or friction found.");
  process.exit(0);
}

// --- Build prompt for Sonnet (tips excluded — appended verbatim) ---

const rawData = JSON.stringify({ commands, skills, hooks, friction });

const prompt = `You are preparing a coaching reference for a DIFFERENT Sonnet instance that will analyze Claude Code session transcripts and give the human operator real-time tips.

Below is the raw data about this user's Claude Code setup. Produce a compact coaching reference (under 500 words) that the session advisor can use to give SPECIFIC, tool-aware tips.

## Raw setup data
${rawData}

## Output requirements
Write plain text (no JSON, no markdown fences). Structure as:

1. **Tools available** — group related commands/skills, note what each does in ≤10 words. The advisor needs to know WHEN to recommend each tool.
2. **Friction patterns** — what has gone wrong before. The advisor should watch for these recurring patterns.

Optimize for token efficiency: no filler, no repetition, no explanations of what a coaching reference is. Every word must help the advisor give better tips.`;

// --- Call Sonnet ---

const claudePath = resolveClaudePath();
console.log("Mining setup context via Sonnet...");

const result = spawnSync(claudePath, ["-p", "--model", "sonnet", "--max-turns", "1"], {
  input: prompt,
  timeout: 120000,
  encoding: "utf-8",
  windowsHide: true,
});

const output = (result.stdout || "").trim();

if (result.error || result.status !== 0 || !output) {
  // Fallback: write raw compact data without Sonnet summarization
  console.warn(`Sonnet call failed${result.stderr ? ": " + (result.stderr).slice(0, 200) : ""}, writing raw fallback`);
  const fallback = [];
  if (commands.length > 0) {
    fallback.push("Commands:");
    for (const c of commands) fallback.push(`  ${c.name} — ${(c.description || "").slice(0, 60)}`);
  }
  if (skills.length > 0) {
    fallback.push("Skills:");
    for (const s of skills) fallback.push(`  ${s.name} — ${(s.description || "").slice(0, 60)}`);
  }
  if (hooks.length > 0) fallback.push(`Hooks: ${hooks.join(", ")}`);
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, fallback.join("\n"));
    console.log(`Fallback setup context written → ${dest}`);
  } catch (e) {
    console.warn(`mine-setup: failed (${e.message})`);
  }
  process.exit(0);
}

try {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, output);
  const tokens = Math.ceil(output.length / 4);
  console.log(`Setup context mined (~${tokens} tokens) → ${dest}`);
} catch (e) {
  console.warn(`mine-setup: failed (${e.message})`);
  process.exit(0); // fail-open
}
