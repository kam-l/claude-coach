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

  // Check for our own wrapper first (already wrapped)
  if (/statusline-aggregator/i.test(cmd)) return "wrapped";

  if (/statusline-tip|session-advisor/i.test(cmd)) return "coach";

  // Any third-party statusline tool — we can wrap it
  const isThirdParty = /ccstatusline/i.test(cmd) || /claude-hud/i.test(cmd);

  // Check if custom script already integrates coach
  if (!isThirdParty && foundIn) {
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

  return isThirdParty ? "third-party" : "custom";
}

/** Try to extract a file path from a statusline command string. */
function extractScriptPath(cmd) {
  // Match: node "path" or node path (with or without quotes)
  const m = cmd.match(/node\s+["']?([^"'\s]+(?:\s[^"'\s]+)*)["']?/);
  if (m) {
    let p = m[1];
    if (p.startsWith("~")) p = path.join(home, p.slice(1));
    return p;
  }
  if (cmd.includes(path.sep) || cmd.includes("/")) {
    let p = cmd.trim();
    if (p.startsWith("~")) p = path.join(home, p.slice(1));
    return p;
  }
  return null;
}

// ─── Wrapper generation ─────────────────────────────────────────────

const tipsScript = path.join(src, "scripts", "statusline-tips.js").replace(/\\/g, "/");

/**
 * Generate a wrapper script that:
 * 1. Reads stdin (JSON from CC)
 * 2. Forks stdin to the original statusline command
 * 3. Runs getSessionAdvice() for coach output
 * 4. Outputs: original output + coach line
 */
function generateWrapper(originalCommand) {
  const advisorPath = path.join(src, "scripts", "session-advisor.js").replace(/\\/g, "/");
  // Escape backslashes and quotes for embedding in template
  const escapedCmd = originalCommand.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  return `#!/usr/bin/env node
/**
 * claude-coach statusline wrapper.
 * Wraps an existing statusline command and appends coach output.
 *
 * Original: ${originalCommand}
 * Generated by: install-statusline.js --wire
 * DO NOT EDIT — re-run /setup install to regenerate.
 */

const { execSync } = require("child_process");
const path = require("path");
const os = require("os");

// Load coach advisor
let getSessionAdvice = () => "";
try {
  ({ getSessionAdvice } = require("${advisorPath}"));
} catch {}

let input = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let originalOutput = "";
  try {
    originalOutput = execSync("${escapedCmd}", {
      input,
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    }).replace(/\\n$/, "");
  } catch (e) {
    // Original command failed — still show coach output
    originalOutput = e.stdout || "";
  }

  let coachLine = "";
  try {
    const data = JSON.parse(input);
    coachLine = getSessionAdvice({ sessionId: data.session_id, cwd: data.cwd });
  } catch {
    try { coachLine = getSessionAdvice(); } catch {}
  }

  // Combine: original output, then coach line
  let out = originalOutput;
  if (coachLine && coachLine.trim()) {
    out = out ? out + coachLine : coachLine;
  }
  process.stdout.write(out);
});
`;
}

// ─── Actions ────────────────────────────────────────────────────────

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

function wireWrapped() {
  // Already wrapped — update the wrapper in case coach version changed
  const wrapperPath = path.join(dest, "statusline-aggregator.js");
  if (fs.existsSync(wrapperPath)) {
    try {
      const content = fs.readFileSync(wrapperPath, "utf-8");
      const m = content.match(/^\s*\* Original: (.+)$/m);
      if (m) {
        fs.writeFileSync(wrapperPath, generateWrapper(m[1]));
        return { detected: "wrapped", action: "Updated existing wrapper to current coach version.", success: true };
      }
    } catch {}
  }
  return { detected: "wrapped", action: "Wrapper already installed. No changes needed.", success: true };
}

function wireCustomWithCoach() {
  return {
    detected: "custom-with-coach",
    action: "Statusline already integrates claude-coach (session-advisor/getSessionAdvice found). No changes needed.",
    success: true,
  };
}

function wireThirdParty(statusLine) {
  const originalCmd = getCommand(statusLine);
  const wrapperPath = path.join(dest, "statusline-aggregator.js").replace(/\\/g, "/");

  // Generate wrapper
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(wrapperPath, generateWrapper(originalCmd));

  // Update settings to point to wrapper
  const target = path.join(home, ".claude", "settings.json");
  const settings = safeReadJSON(target) || {};
  settings.statusLine = {
    type: "command",
    command: `node "${wrapperPath}"`,
  };
  safeWriteJSON(target, settings);

  return {
    detected: "third-party",
    action: `Wrapped "${originalCmd}" with coach integration at ${wrapperPath}. Original command preserved inside wrapper.`,
    success: true,
  };
}

function wireCustom(statusLine) {
  const originalCmd = getCommand(statusLine);
  const wrapperPath = path.join(dest, "statusline-aggregator.js").replace(/\\/g, "/");

  // Generate wrapper
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(wrapperPath, generateWrapper(originalCmd));

  // Update settings to point to wrapper
  const target = path.join(home, ".claude", "settings.json");
  const settings = safeReadJSON(target) || {};
  settings.statusLine = {
    type: "command",
    command: `node "${wrapperPath}"`,
  };
  safeWriteJSON(target, settings);

  return {
    detected: "custom",
    action: `Wrapped "${originalCmd}" with coach integration at ${wrapperPath}. Original command preserved inside wrapper.`,
    success: true,
  };
}

// ─── Wire orchestrator ──────────────────────────────────────────────

function wire() {
  const cwd = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
  const { statusLine, foundIn } = readStatusLine(cwd);
  const detected = detect(statusLine, foundIn);

  let result;
  switch (detected) {
    case "none":              result = wireNone(); break;
    case "coach":             result = wireCoach(); break;
    case "wrapped":           result = wireWrapped(); break;
    case "custom-with-coach": result = wireCustomWithCoach(); break;
    case "third-party":       result = wireThirdParty(statusLine); break;
    case "custom":            result = wireCustom(statusLine); break;
    default:                  result = { detected, action: "Unknown state", success: false };
  }

  console.log(JSON.stringify(result, null, 2));
}

// ─── Main ───────────────────────────────────────────────────────────

setupRuntime();
if (wireMode) wire();
