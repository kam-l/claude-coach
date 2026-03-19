#!/usr/bin/env node
/**
 * Scans the Claude ecosystem for tip sources.
 * Outputs structured JSON to stdout.
 *
 * Usage: node scan.js [--project-dir <path>]
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const args = process.argv.slice(2);
const pdIdx = args.indexOf("--project-dir");
const projectDir = (pdIdx !== -1 && args[pdIdx + 1])
  ? args[pdIdx + 1]
  : (process.env.CLAUDE_PROJECT_ROOT || process.cwd());

const home = os.homedir();
const claudeHome = path.join(home, ".claude");

const result = {
  commands: [],
  skills: [],
  insights: [],
};

// --- Helpers ---

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return null;
  }
}

function extractFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  let currentKey = null;
  let multiLineMode = null; // "quoted" | "block"
  for (const line of match[1].split("\n")) {
    // Continuation of a multi-line value
    if (currentKey && multiLineMode) {
      if (multiLineMode === "quoted") {
        fm[currentKey] += " " + line.trim().replace(/["']$/g, "");
        if (/["']$/.test(line.trim())) { currentKey = null; multiLineMode = null; }
      } else if (multiLineMode === "block") {
        // Block scalar continues while indented
        if (/^\s/.test(line)) {
          fm[currentKey] += (fm[currentKey] ? " " : "") + line.trim();
        } else {
          currentKey = null; multiLineMode = null;
          // Fall through to parse this line as a new key
        }
      }
      if (currentKey) continue;
    }
    const sep = line.indexOf(":");
    if (sep > 0) {
      const key = line.slice(0, sep).trim();
      let val = line.slice(sep + 1).trim();
      // YAML block scalar (> or |)
      if (val === ">" || val === "|") {
        fm[key] = "";
        currentKey = key;
        multiLineMode = "block";
      } else if (/^["']/.test(val) && /["']$/.test(val)) {
        fm[key] = val.slice(1, -1);
        currentKey = null; multiLineMode = null;
      } else if (/^["']/.test(val)) {
        fm[key] = val.slice(1);
        currentKey = key; multiLineMode = "quoted";
      } else {
        fm[key] = val;
        currentKey = null; multiLineMode = null;
      }
    }
  }
  return fm;
}

function findFiles(dirs, pattern) {
  const found = [];
  const isExact = !pattern.includes("*");
  const matchFn = isExact
    ? (name) => name.toLowerCase() === pattern.toLowerCase()
    : (name) => name.toLowerCase().endsWith(pattern.replace("*", "").toLowerCase());

  function walk(dir) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && matchFn(entry.name)) found.push(full);
      }
    } catch { /* skip inaccessible */ }
  }

  for (const dir of dirs) {
    try { if (fs.existsSync(dir)) walk(dir); } catch { /* skip */ }
  }
  return found;
}

function findMdFiles(dirs) {
  return findFiles(dirs, "*.md");
}

// --- Scan commands ---

const commandDirs = [
  path.join(claudeHome, "commands"),
  path.join(projectDir, ".claude", "commands"),
];
for (const file of findMdFiles(commandDirs)) {
  const content = safeRead(file);
  if (!content) continue;
  const fm = extractFrontmatter(content);
  result.commands.push({
    path: file,
    description: fm.description || content.split("\n")[0].replace(/^#\s*/, ""),
  });
}

// --- Scan skills ---

const skillDirs = [
  path.join(claudeHome, "skills"),
  path.join(claudeHome, "plugins", "cache"),
  path.join(projectDir, ".claude", "skills"),
  path.join(projectDir, "skills"),
];
for (const file of findFiles(skillDirs, "SKILL.md")) {
  const content = safeRead(file);
  if (!content) continue;
  const fm = extractFrontmatter(content);
  result.skills.push({
    path: file,
    description: fm.description || "",
  });
}

// --- Scan insights facets ---

const facetsDir = path.join(claudeHome, "usage-data", "facets");
try {
  if (fs.existsSync(facetsDir)) {
    const files = fs.readdirSync(facetsDir)
      .filter(f => f.endsWith(".json"))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(facetsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 5);

    for (const { name } of files) {
      const content = safeRead(path.join(facetsDir, name));
      if (!content) continue;
      try {
        const data = JSON.parse(content);
        result.insights.push({
          path: path.join(facetsDir, name),
          friction_categories: data.friction_categories || [],
          underlying_goal: data.underlying_goal || "",
          outcome: data.outcome || "",
        });
      } catch { /* malformed JSON */ }
    }
  }
} catch { /* facets dir inaccessible */ }

// --- Output ---

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
