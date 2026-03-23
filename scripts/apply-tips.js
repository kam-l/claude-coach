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

// Full-replace curated + generated tips, but preserve:
// - Other projects' tips (💡 tips ending with [OtherProject])
// - Non-💡 manual/custom tips
const existing = settings.spinnerTipsOverride?.tips || [];
const projectSuffix = projectName ? `[${projectName}]` : null;

const preserved = existing.filter(t => {
  if (!t.startsWith("💡")) return true; // keep non-curated manual tips
  const bracketMatch = t.match(/\[([^\]]+)\]$/);
  if (!bracketMatch) return false; // curated or global generated — will be replaced
  if (projectSuffix && t.endsWith(projectSuffix)) return false; // current project — will be re-generated
  return true; // other project's tips — keep
});

const generatedTips = [...globalTips, ...projectTips];
const finalTips = [...curated, ...generatedTips, ...preserved];

settings.spinnerTipsEnabled = true;
settings.spinnerTipsOverride = {
  excludeDefault: true,
  tips: finalTips,
};

if (dryRun) {
  console.log(`Full replace: ${curated.length} curated + ${globalTips.length} global + ${projectTips.length} project tips`);
  console.log(`Preserved from other projects: ${preserved.length}`);
  console.log(`Total would be: ${finalTips.length} tips`);
} else {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  console.log(`Replaced: ${curated.length} curated + ${globalTips.length} global + ${projectTips.length} project tips → ${settingsPath}`);
  console.log(`Preserved ${preserved.length} other-project tips. Total: ${finalTips.length}`);
}
