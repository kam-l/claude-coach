#!/usr/bin/env node
/**
 * Copies runtime files to ~/.claude/plugins/claude-coach/ so the statusline
 * never reaches back into the plugin cache. Idempotent — safe to re-run
 * on every plugin update.
 *
 * Part of claude-coach.
 * Source: CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, "..")
 * Target: ~/.claude/plugins/claude-coach/
 *
 * Files copied:
 *   statusline-tips.js   (statusline entrypoint)
 *   session-advisor.js   (library + worker)
 *
 * Data files (tips.json, claude-usage.md) are read from __dirname at
 * runtime — no copy needed.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const src = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, "..");
const dest = path.join(os.homedir(), ".claude", "plugins", "claude-coach");

const FILES = [
  { from: path.join("scripts", "statusline-tips.js"), to: "statusline-tips.js" },
  { from: path.join("scripts", "session-advisor.js"), to: "session-advisor.js" },
];

try {
  fs.mkdirSync(dest, { recursive: true });

  for (const { from, to, optional } of FILES) {
    const srcPath = path.join(src, from);
    const destPath = path.join(dest, to);
    try {
      fs.copyFileSync(srcPath, destPath);
    } catch (e) {
      if (!optional) throw e;
    }
  }

  // Write version marker for diagnostics
  let version = "unknown";
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(src, "package.json"), "utf-8"));
    if (pkg.version) version = pkg.version;
  } catch { /* */ }

  fs.writeFileSync(
    path.join(dest, "version.json"),
    JSON.stringify({ version, installedAt: new Date().toISOString(), source: src }, null, 2) + "\n"
  );

  console.log(`claude-coach: runtime files installed to ${dest} (v${version})`);
} catch (e) {
  console.warn(`claude-coach: install-statusline failed (${e.message})`);
  process.exit(0); // fail-open
}
