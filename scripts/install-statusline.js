#!/usr/bin/env node
/**
 * Runtime setup + statusline wiring for claude-coach.
 *
 * No flags:   Creates mutable runtime dir, cleans stale copies, writes version marker.
 * --wire:     Detects existing statusline config and wires claude-coach integration.
 *
 * Part of claude-coach.
 * Source: CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, "..")
 * Target: CLAUDE_PLUGIN_DATA  (mutable data only: cache/, logs, setup-context)
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const src = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, "..");
const dest = process.env.CLAUDE_PLUGIN_DATA;
const home = os.homedir();
const wireMode = process.argv.includes("--wire");

// ─── Runtime dir setup (always runs) ────────────────────────────────

function setupRuntime() {
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
    console.warn(`claude-coach: runtime setup failed (${e.message})`);
    process.exit(0); // fail-open
  }
}

// ─── Settings helpers ───────────────────────────────────────────────

function safeReadJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch { return null; }
}

function safeWriteJSON(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n");
}

/**
 * Read statusLine from settings cascade (first wins).
 * Returns { statusLine, foundIn } or { statusLine: null, foundIn: null }.
 */
function readStatusLine(cwd) {
  const cascade = [];
  if (cwd) {
    cascade.push(path.join(cwd, ".claude", "settings.local.json"));
    cascade.push(path.join(cwd, ".claude", "settings.json"));
  }
  cascade.push(path.join(home, ".claude", "settings.local.json"));
  cascade.push(path.join(home, ".claude", "settings.json"));

  for (const file of cascade) {
    const data = safeReadJSON(file);
    if (data && data.statusLine) {
      return { statusLine: data.statusLine, foundIn: file };
    }
  }
  return { statusLine: null, foundIn: null };
}

/** Extract command string from statusLine (handles both string and object forms). */
function getCommand(statusLine) {
  if (!statusLine) return "";
  if (typeof statusLine === "string") return statusLine;
  return statusLine.command || "";
}

// ─── Detection ──────────────────────────────────────────────────────

function detect(statusLine, foundIn) {
  const cmd = getCommand(statusLine);
  if (!cmd && !statusLine) return "none";
  if (/ccstatusline/i.test(cmd)) return "ccstatusline";
  if (/claude-hud/i.test(cmd)) return "claude-hud";
  if (/statusline-tip|session-advisor/i.test(cmd)) return "coach";

  // Check if custom script already integrates coach
  if (foundIn) {
    const scriptPath = extractScriptPath(cmd);
    if (scriptPath) {
      try {
        const content = fs.readFileSync(scriptPath, "utf-8");
        if (/session-advisor|getSessionAdvice/i.test(content)) {
          return "custom-with-coach";
        }
      } catch {}
    }
  }

  return "custom";
}

/** Try to extract a file path from a statusline command string. */
function extractScriptPath(cmd) {
  // Match: node "path" or node path (with or without quotes)
  const m = cmd.match(/node\s+["']?([^"'\s]+(?:\s[^"'\s]+)*)["']?/);
  if (m) {
    let p = m[1];
    // Expand ~ to home
    if (p.startsWith("~")) p = path.join(home, p.slice(1));
    return p;
  }
  // If cmd itself looks like a path
  if (cmd.includes(path.sep) || cmd.includes("/")) {
    let p = cmd.trim();
    if (p.startsWith("~")) p = path.join(home, p.slice(1));
    return p;
  }
  return null;
}

// ─── Actions ────────────────────────────────────────────────────────

const tipsScript = path.join(src, "scripts", "statusline-tips.js").replace(/\\/g, "/");

function wireNone() {
  const target = path.join(home, ".claude", "settings.json");
  const settings = safeReadJSON(target) || {};
  settings.statusLine = {
    type: "command",
    command: `node "${tipsScript}"`,
  };
  safeWriteJSON(target, settings);
  return { detected: "none", action: `Registered statusline-tips.js in ${target}`, success: true };
}

function wireCoach() {
  const target = path.join(home, ".claude", "settings.json");
  const settings = safeReadJSON(target) || {};
  settings.statusLine = {
    type: "command",
    command: `node "${tipsScript}"`,
  };
  safeWriteJSON(target, settings);
  return { detected: "coach", action: `Updated claude-coach statusline path to current version`, success: true };
}

function wireCustomWithCoach() {
  return {
    detected: "custom-with-coach",
    action: "Statusline already integrates claude-coach (session-advisor/getSessionAdvice found). No changes needed.",
    success: true,
  };
}

function wireCcstatusline() {
  const configPath = path.join(home, ".config", "ccstatusline", "settings.json");
  const config = safeReadJSON(configPath);

  // Verify config exists and has expected shape
  if (config && config.lines && Array.isArray(config.lines)) {
    // Check if already injected
    const hasCoach = JSON.stringify(config).includes("claude-coach");
    if (hasCoach) {
      return { detected: "ccstatusline", action: "ccstatusline already has claude-coach widget. No changes needed.", success: true };
    }

    // Find first line's items array to append widget
    const line = config.lines[0];
    if (line && Array.isArray(line.items)) {
      line.items.push({
        type: "custom-command",
        command: `node "${tipsScript}"`,
        label: "coach",
        color: "#b48ead",
      });
      safeWriteJSON(configPath, config);
      return { detected: "ccstatusline", action: `Injected claude-coach Custom Command widget into ${configPath}`, success: true };
    }
  }

  // Fallback: config missing or unexpected schema
  const snippet = JSON.stringify({
    type: "custom-command",
    command: `node "${tipsScript}"`,
    label: "coach",
    color: "#b48ead",
  }, null, 2);

  return {
    detected: "ccstatusline",
    action: `ccstatusline config not found or unrecognized format. Add this widget manually to your ccstatusline config:\n${snippet}`,
    success: false,
  };
}

function wireClaudeHud() {
  return {
    detected: "claude-hud",
    action: "claude-hud has no extension mechanism. Advisor display and pending reflections (💭) are not available in the statusline. Spinner tips still work, and /reflect is available to review reflections manually.",
    success: true,
  };
}

function wireCustom(statusLine) {
  const cmd = getCommand(statusLine);
  const snippet = `
// Add to your statusline script to integrate claude-coach:
let getSessionAdvice = () => "";
try {
  const coachCache = require("path").join(require("os").homedir(), ".claude", "plugins", "cache", "claude-coach", "claude-coach");
  const versions = require("fs").readdirSync(coachCache).sort();
  ({ getSessionAdvice } = require(require("path").join(coachCache, versions[versions.length - 1], "scripts", "session-advisor")));
} catch {}
// Then call: getSessionAdvice({ sessionId, cwd }) — returns tip text with 💭 pending reflections
`.trim();

  return {
    detected: "custom",
    action: `Custom statusline detected (${cmd}). Not modifying. To integrate claude-coach, add this to your script:\n\n${snippet}`,
    success: false,
  };
}

// ─── Wire orchestrator ──────────────────────────────────────────────

function wire() {
  const cwd = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
  const { statusLine, foundIn } = readStatusLine(cwd);
  const detected = detect(statusLine, foundIn);

  let result;
  switch (detected) {
    case "none":             result = wireNone(); break;
    case "coach":            result = wireCoach(); break;
    case "custom-with-coach": result = wireCustomWithCoach(); break;
    case "ccstatusline":     result = wireCcstatusline(); break;
    case "claude-hud":       result = wireClaudeHud(); break;
    case "custom":           result = wireCustom(statusLine); break;
    default:                 result = { detected, action: "Unknown state", success: false };
  }

  console.log(JSON.stringify(result, null, 2));
}

// ─── Main ───────────────────────────────────────────────────────────

setupRuntime();
if (wireMode) wire();
