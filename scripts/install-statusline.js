#!/usr/bin/env node
/**
 * Ensures the mutable runtime directory exists and writes a version marker.
 * Scripts run directly from the plugin cache — no file copies needed.
 *
 * Part of claude-coach.
 * Source: CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, "..")
 * Target: ~/.claude/plugins/claude-coach/  (mutable data only: cache/, logs, setup-context)
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const src = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, "..");
const dest = path.join(os.homedir(), ".claude", "plugins", "claude-coach");

try {
  fs.mkdirSync(dest, { recursive: true });

  // Clean up stale runtime copies (now served from plugin cache)
  for (const stale of ["statusline-tips.js", "session-advisor.js"]) {
    try { fs.unlinkSync(path.join(dest, stale)); } catch {}
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

  console.log(`claude-coach: runtime dir ready at ${dest} (v${version})`);
} catch (e) {
  console.warn(`claude-coach: install-statusline failed (${e.message})`);
  process.exit(0); // fail-open
}
