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
const { safeRead, extractFrontmatter, findFiles, findMdFiles } = require("./helpers");

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
