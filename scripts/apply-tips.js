#!/usr/bin/env node
/**
 * Merges curated tips from tips.json into ~/.claude/settings.json (global)
 * Usage: node apply-tips.js [--scope user|project|local] [--category <cat>] [--dry-run]
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const scopeIdx = args.indexOf("--scope");
const scope = (scopeIdx !== -1 && args[scopeIdx + 1]) ? args[scopeIdx + 1] : "user";

let filterCat = null;
const catIdx = args.indexOf("--category");
if (catIdx !== -1 && args[catIdx + 1]) filterCat = args[catIdx + 1];

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

// Merge tips (deduplicate by lowercase prefix match)
const existing = settings.spinnerTipsOverride?.tips || [];
const existingLower = new Set(existing.map(t => t.toLowerCase().slice(0, 40)));
const newTips = curated.filter(t => !existingLower.has(t.toLowerCase().slice(0, 40)));

settings.spinnerTipsEnabled = true;
settings.spinnerTipsOverride = {
  tips: [...existing, ...newTips],
  excludeDefault: true
};

if (dryRun) {
  console.log(`Would add ${newTips.length} tips (${existing.length} existing, ${curated.length} curated)`);
  console.log("New tips:", JSON.stringify(newTips, null, 2));
} else {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  console.log(`Added ${newTips.length} tips to ${settingsPath}`);
  console.log(`Total: ${settings.spinnerTipsOverride.tips.length} tips`);
}
