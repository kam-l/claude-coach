#!/usr/bin/env node
/**
 * Postinstall: registers claude-coach as a Claude Code plugin.
 *
 * On Windows, `claude plugin install` fails for external-source marketplace
 * plugins (EPERM on git clone+rename). This script bypasses the installer
 * by populating the same files directly:
 *
 *   1. ~/.claude/plugins/cache/kam-l-plugins/claude-coach/<ver>/  (plugin files)
 *   2. ~/.claude/plugins/installed_plugins.json                    (plugin registry)
 *   3. ~/.claude/plugins/known_marketplaces.json                   (marketplace registry)
 *   4. ~/.claude/settings.json  enabledPlugins + extraKnownMarketplaces
 *
 * Fail-open: if any step errors, print a warning and suggest --plugin-dir.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const PLUGIN_NAME = "claude-coach";
const MARKETPLACE_NAME = "kam-l-plugins";
const MARKETPLACE_REPO = "kam-l/claude-plugins";

const srcDir = path.resolve(__dirname, "..");

// Skip if running in dev (source repo has .git dir)
try { if (fs.existsSync(path.join(srcDir, ".git"))) process.exit(0); } catch { /* */ }

let version = "1.0.0";
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(srcDir, "package.json"), "utf-8"));
  if (/^\d+\.\d+\.\d+/.test(pkg.version)) version = pkg.version;
} catch { /* use default */ }

const pluginKey = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;
const claudeDir = path.join(os.homedir(), ".claude");
const pluginsDir = path.join(claudeDir, "plugins");
const cacheDir = path.join(pluginsDir, "cache", MARKETPLACE_NAME, PLUGIN_NAME, version);

function readJSON(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : null;
  } catch { return null; }
}

function writeJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    if (entry.isSymbolicLink()) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    entry.isDirectory() ? copyDirSync(s, d) : fs.copyFileSync(s, d);
  }
}

try {
  // 1. Cache plugin files (purge stale versions first)
  const pluginCacheParent = path.join(pluginsDir, "cache", MARKETPLACE_NAME, PLUGIN_NAME);
  if (fs.existsSync(pluginCacheParent)) {
    for (const entry of fs.readdirSync(pluginCacheParent, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== version) {
        fs.rmSync(path.join(pluginCacheParent, entry.name), { recursive: true, force: true });
      }
    }
  }
  if (fs.existsSync(cacheDir)) fs.rmSync(cacheDir, { recursive: true, force: true });
  copyDirSync(srcDir, cacheDir);

  // 2. Register in installed_plugins.json
  const installedPath = path.join(pluginsDir, "installed_plugins.json");
  const installed = readJSON(installedPath) || { version: 2, plugins: {} };
  if (!installed.plugins) installed.plugins = {};
  installed.plugins[pluginKey] = [{
    scope: "user",
    installPath: cacheDir,
    version,
    installedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  }];
  writeJSON(installedPath, installed);

  // 3. Register in known_marketplaces.json
  const knownPath = path.join(pluginsDir, "known_marketplaces.json");
  const known = readJSON(knownPath) || {};
  if (!known[MARKETPLACE_NAME]) {
    known[MARKETPLACE_NAME] = {
      source: { source: "github", repo: MARKETPLACE_REPO },
      installLocation: path.join(pluginsDir, "marketplaces", MARKETPLACE_NAME),
      lastUpdated: new Date().toISOString(),
    };
    writeJSON(knownPath, known);
  }

  // 4. Register in settings.json
  const settingsPath = path.join(claudeDir, "settings.json");
  const settings = readJSON(settingsPath) || {};

  if (!settings.enabledPlugins) settings.enabledPlugins = {};
  settings.enabledPlugins[pluginKey] = true;

  if (!settings.extraKnownMarketplaces) settings.extraKnownMarketplaces = {};
  if (!settings.extraKnownMarketplaces[MARKETPLACE_NAME]) {
    settings.extraKnownMarketplaces[MARKETPLACE_NAME] = {
      source: { source: "github", repo: MARKETPLACE_REPO },
    };
  }

  writeJSON(settingsPath, settings);

  // Copy runtime files to ~/.claude/plugins/claude-coach/ (survives plugin version bumps)
  try {
    require("child_process").execSync(
      `"${process.execPath}" "${path.join(srcDir, "scripts", "install-statusline.js")}"`,
      { encoding: "utf-8", timeout: 10000, env: { ...process.env, CLAUDE_PLUGIN_ROOT: srcDir } }
    );
  } catch (e) {
    console.warn(`claude-coach: statusline install skipped (${e.message})`);
  }

  console.log(`claude-coach: installed to plugin cache (v${version})`);
  console.log("claude-coach: restart Claude Code to activate /claude-coach:tips");
} catch (e) {
  console.warn(`claude-coach: setup incomplete (${e.message})`);
  console.warn("claude-coach: fallback: claude --plugin-dir <path-to-claude-coach>");
}
