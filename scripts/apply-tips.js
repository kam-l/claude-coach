#!/usr/bin/env node
/**
 * Merges curated tips from tips.json into ~/.claude/settings.json (global)
 * and optionally generates project-specific tips from commands/skills.
 *
 * Usage: node apply-tips.js [--scope user|project|local] [--category <cat>]
 *                           [--project-dir <path>] [--dry-run]
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { safeRead, extractFrontmatter, findFiles, findMdFiles } = require("./helpers");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const scopeIdx = args.indexOf("--scope");
const scope = (scopeIdx !== -1 && args[scopeIdx + 1]) ? args[scopeIdx + 1] : "user";

let filterCat = null;
const catIdx = args.indexOf("--category");
if (catIdx !== -1 && args[catIdx + 1]) filterCat = args[catIdx + 1];

const pdIdx = args.indexOf("--project-dir");
const projectDir = (pdIdx !== -1 && args[pdIdx + 1])
  ? args[pdIdx + 1]
  : (process.env.CLAUDE_PROJECT_ROOT || null);

// Load curated tips
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, "..");
const tipsFile = path.join(pluginRoot, "tips.json");
if (!fs.existsSync(tipsFile)) {
  console.error("tips.json not found at", tipsFile);
  process.exit(1);
}
let tipsDb;
try {
  tipsDb = JSON.parse(fs.readFileSync(tipsFile, "utf-8"));
} catch (e) {
  console.error("Failed to parse tips.json:", e.message);
  process.exit(1);
}

// Flatten selected categories
let curated = [];
for (const [cat, tips] of Object.entries(tipsDb.categories)) {
  if (filterCat && cat !== filterCat) continue;
  curated.push(...tips);
}

// Resolve settings path by scope
const scopePaths = {
  user: path.join(os.homedir(), ".claude", "settings.json"),
  project: path.join(process.cwd(), ".claude", "settings.json"),
  local: path.join(process.cwd(), ".claude", "settings.local.json"),
};
const settingsPath = scopePaths[scope];
if (!settingsPath) {
  console.error(`Unknown scope: ${scope}. Use user, project, or local.`);
  process.exit(1);
}
let settings = {};
if (fs.existsSync(settingsPath)) {
  settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
}

// --- Generate tips from commands/skills ---

function formatTip(name, description, suffix) {
  // Strip trigger lists from description (everything after ". Triggers:" or similar)
  let desc = description
    .replace(/\.\s*Triggers?:.*$/i, "")
    .replace(/\s*\(triggers?:.*\)$/i, "")
    .trim();
  // Remove trailing period
  if (desc.endsWith(".")) desc = desc.slice(0, -1);
  // Build tip and truncate to 80 chars
  const prefix = `💡 /${name} — `;
  const suffixPart = suffix ? ` ${suffix}` : "";
  const maxDesc = 80 - prefix.length - suffixPart.length;
  if (desc.length > maxDesc) {
    desc = desc.slice(0, maxDesc - 1).replace(/\s+\S*$/, "") + "…";
  }
  return `${prefix}${desc}${suffixPart}`;
}

function scanTips(commandDirs, skillDirs, suffix, seenNames) {
  const tips = [];

  for (const file of findMdFiles(commandDirs)) {
    const content = safeRead(file);
    if (!content) continue;
    const name = path.basename(file, ".md");
    if (seenNames.has(name)) continue;
    seenNames.add(name);
    const fm = extractFrontmatter(content);
    if (!fm.description) continue;
    tips.push(formatTip(name, fm.description, suffix));
  }

  for (const file of findFiles(skillDirs, "SKILL.md")) {
    const content = safeRead(file);
    if (!content) continue;
    const name = path.basename(path.dirname(file));
    if (seenNames.has(name)) continue;
    seenNames.add(name);
    const fm = extractFrontmatter(content);
    if (fm["user-invocable"] === "false") continue;
    const desc = fm.description || "";
    if (desc) tips.push(formatTip(name, desc, suffix));
  }

  return tips;
}

const claudeHome = path.join(os.homedir(), ".claude");
const seenNames = new Set();

// Global (user-scope) commands/skills — no suffix
const globalTips = scanTips(
  [path.join(claudeHome, "commands")],
  [path.join(claudeHome, "skills")],
  null,
  seenNames,
);

// Project-specific commands/skills — [ProjectName] suffix
let projectTips = [];
let projectName = null;
if (projectDir) {
  projectName = path.basename(projectDir);
  projectTips = scanTips(
    [path.join(projectDir, ".claude", "commands"), path.join(projectDir, "commands")],
    [path.join(projectDir, ".claude", "skills"), path.join(projectDir, "skills")],
    `[${projectName}]`,
    seenNames,
  );
}

// --- Merge ---

// 1. Start with existing tips
let existing = settings.spinnerTipsOverride?.tips || [];

// 2. Strip stale generated tips (global + this project only, never touch other projects)
//    Global tips have no suffix — match by "💡 /{name} —" prefix against globalTips
const globalPrefixes = new Set(globalTips.map(t => t.toLowerCase().slice(0, 40)));
existing = existing.filter(t => !globalPrefixes.has(t.toLowerCase().slice(0, 40)));
if (projectName) {
  const thisSuffix = `[${projectName}]`;
  existing = existing.filter(t => !t.endsWith(thisSuffix));
}

// 3. Dedup curated tips against cleaned existing (40-char prefix match)
const existingLower = new Set(existing.map(t => t.toLowerCase().slice(0, 40)));
const newCurated = curated.filter(t => !existingLower.has(t.toLowerCase().slice(0, 40)));

// 4. Combine: existing + new curated + global + project tips
const generatedTips = [...globalTips, ...projectTips];
const finalTips = [...existing, ...newCurated, ...generatedTips];

settings.spinnerTipsEnabled = true;
settings.spinnerTipsOverride = {
  tips: finalTips,
};

if (dryRun) {
  console.log(`Would add ${newCurated.length} curated tips (${existing.length} existing)`);
  if (newCurated.length > 0) {
    console.log("New curated:", JSON.stringify(newCurated, null, 2));
  }
  if (globalTips.length > 0) {
    console.log(`Would add ${globalTips.length} global tips:`);
    for (const t of globalTips) console.log("  " + t);
  }
  if (projectTips.length > 0) {
    console.log(`Would add ${projectTips.length} project tips [${projectName}]:`);
    for (const t of projectTips) console.log("  " + t);
  }
  console.log(`Total would be: ${finalTips.length} tips`);
} else {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  console.log(`Added ${newCurated.length} curated + ${globalTips.length} global + ${projectTips.length} project tips to ${settingsPath}`);
  console.log(`Total: ${finalTips.length} tips`);
}
