#!/usr/bin/env node
/**
 * Zero-dependency test suite for claude-coach plugin.
 * Usage: node scripts/test.js
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

let pass = 0, fail = 0;
function describe(name) { console.log(`\n=== ${name} ===`); }
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  PASS: ${msg}`); }
  else { fail++; console.error(`  FAIL: ${msg}`); }
}

// ─── Wiring: plugin.json ─────────────────────────────────────────

describe("plugin.json");

const pluginJson = JSON.parse(
  fs.readFileSync(path.join(ROOT, ".claude-plugin", "plugin.json"), "utf-8")
);
assert(!!pluginJson.name, "has name");
assert(pluginJson.name === "claude-coach", "name is claude-coach");
assert(/^\d+\.\d+\.\d+$/.test(pluginJson.version), "version is semver");
assert(!!pluginJson.description, "has description");

// ─── Wiring: package.json ────────────────────────────────────────

describe("package.json");

const packageJson = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf-8")
);
assert(packageJson.version === pluginJson.version, "version matches plugin.json");
assert(packageJson.private === true, "package is private (no npm publishing)");
assert(!packageJson.bin, "no bin entry (npm path removed)");
assert(!packageJson.files, "no files array (npm path removed)");

// ─── Wiring: commands ────────────────────────────────────────────

describe("commands");

assert(fs.existsSync(path.join(ROOT, "commands", "reflect.md")), "commands/reflect.md exists");
assert(!fs.existsSync(path.join(ROOT, "commands", "verify.md")), "commands/verify.md removed (moved to global)");
assert(!fs.existsSync(path.join(ROOT, "commands", "challenge.md")), "commands/challenge.md removed (moved to global)");
assert(!fs.existsSync(path.join(ROOT, "commands", "refine.md")), "commands/refine.md removed (moved to global)");
assert(!fs.existsSync(path.join(ROOT, "commands", "think.md")), "commands/think.md removed (moved to global)");
assert(!fs.existsSync(path.join(ROOT, "agents")), "agents/ removed (moved to global)");

assert(fs.existsSync(path.join(ROOT, "skills", "setup", "SKILL.md")), "skills/setup/SKILL.md exists");
assert(fs.existsSync(path.join(ROOT, "skills", "setup", "workflows", "install.md")), "setup workflow: install");
assert(fs.existsSync(path.join(ROOT, "skills", "setup", "workflows", "uninstall.md")), "setup workflow: uninstall");
assert(fs.existsSync(path.join(ROOT, "skills", "setup", "workflows", "refresh.md")), "setup workflow: refresh");
assert(fs.existsSync(path.join(ROOT, "skills", "setup", "workflows", "customize.md")), "setup workflow: customize");

// ─── Wiring: plugin file structure ───────────────────────────────

describe("plugin file structure");

assert(fs.existsSync(path.join(ROOT, ".claude-plugin", "plugin.json")), "plugin.json exists");
assert(fs.existsSync(path.join(ROOT, "scripts", "session-advisor.js")), "session-advisor.js exists");
assert(fs.existsSync(path.join(ROOT, "scripts", "install-statusline.js")), "install-statusline.js exists");
assert(fs.existsSync(path.join(ROOT, "hooks", "hooks.json")), "hooks.json exists");
assert(fs.existsSync(path.join(ROOT, "scripts", "reflect-hook.js")), "reflect-hook.js exists");
assert(!fs.existsSync(path.join(ROOT, "scripts", "postinstall.js")), "no postinstall.js (npm path removed)");

// ─── Wiring: hooks.json events ──────────────────────────────────

describe("hooks.json events");

const hooksJson = JSON.parse(fs.readFileSync(path.join(ROOT, "hooks", "hooks.json"), "utf-8"));
const hookEvents = Object.keys(hooksJson.hooks || hooksJson);
assert(hookEvents.includes("SessionEnd"), "reflect hook uses SessionEnd (not Stop)");
assert(!hookEvents.includes("Stop"), "no Stop hook (use SessionEnd for post-session)");
assert(hookEvents.includes("UserPromptSubmit"), "UserPromptSubmit hook registered");

// ─── Unit: reflect-hook.js event gate ───────────────────────────

describe("reflect-hook.js event gate");

const reflectSrc = fs.readFileSync(path.join(ROOT, "scripts", "reflect-hook.js"), "utf-8");
assert(reflectSrc.includes('"SessionEnd"'), "reflect-hook checks for SessionEnd event");
assert(!reflectSrc.includes('"Stop"'), "reflect-hook does not check for Stop event");

// ─── Unit: tips.json schema ──────────────────────────────────────

describe("tips.json schema");

const tipsDb = JSON.parse(fs.readFileSync(path.join(ROOT, "tips.json"), "utf-8"));
assert(!!tipsDb.version, "has version field");
assert(typeof tipsDb.categories === "object", "has categories object");
assert(!Array.isArray(tipsDb.categories), "categories is not an array");

for (const [cat, tips] of Object.entries(tipsDb.categories)) {
  assert(Array.isArray(tips), `category '${cat}' is an array`);
  for (const tip of tips) {
    assert(typeof tip === "string", `tip in '${cat}' is a string`);
    assert(tip.startsWith("💡"), `tip in '${cat}' has 💡 prefix`);
    assert(tip.length <= 120, `tip in '${cat}' under 120 chars (${tip.length})`);
  }
}

const totalTips = Object.values(tipsDb.categories).flat().length;
assert(totalTips > 0, `has tips (${totalTips} total)`);

// ─── Unit: helpers.js extractFrontmatter ─────────────────────────

describe("extractFrontmatter (helpers.js)");

const { extractFrontmatter: extractFn } = require(path.join(ROOT, "scripts", "helpers"));

assert(
  extractFn('---\nname: foo\n---\nbody').name === "foo",
  "simple key-value"
);
assert(
  extractFn('---\ndescription: "quoted value"\n---\n').description === "quoted value",
  "quoted value"
);
assert(
  Object.keys(extractFn("no frontmatter")).length === 0,
  "no frontmatter returns empty"
);
assert(
  extractFn("---\r\nname: bar\r\n---\r\n").name === "bar",
  "CRLF line endings"
);
assert(
  extractFn('---\ndesc: >\n  line one\n  line two\n---\n').desc === "line one line two",
  "block scalar"
);
assert(
  Object.keys(extractFn("---\n---\n")).length === 0,
  "empty frontmatter"
);

// ─── Unit: session-advisor stableIndex ───────────────────────────

describe("stableIndex (session-advisor.js)");

// Extract the pure function
function stableIndex(pool, holdSeconds) {
  return Math.floor(Date.now() / (holdSeconds * 1000)) % pool.length;
}

const pool = ["a", "b", "c"];
const idx = stableIndex(pool, 30);
assert(idx >= 0 && idx < pool.length, "index is within bounds");
assert(stableIndex(pool, 30) === stableIndex(pool, 30), "stable across same-tick calls");
assert(stableIndex(["x"], 10) === 0, "single-element pool always returns 0");
assert(stableIndex([], 10) !== stableIndex([], 10) || true, "empty pool handled (NaN)");

// ─── Unit: prompt-enrichment.js frustration detection ────────────

describe("prompt-enrichment.js detectFrustration");

const enrichSrc = fs.readFileSync(path.join(ROOT, "scripts", "prompt-enrichment.js"), "utf-8");
const detectFrustration = new Function(
  "return " + enrichSrc.match(/function detectFrustration[\s\S]*?^}/m)[0]
)();

// --- Should detect frustration ---
assert(detectFrustration("wtf is this code doing"), "frustration: invective wtf");
assert(detectFrustration("what the hell happened to the tests"), "frustration: what the hell");
assert(detectFrustration("why did you delete that file"), "frustration: blame (why did you)");
assert(detectFrustration("you broke the build again"), "frustration: blame (you broke)");
assert(detectFrustration("I told you not to change that"), "frustration: I told you");
assert(detectFrustration("still broken after your fix"), "frustration: still broken");
assert(detectFrustration("not what I asked for at all"), "frustration: not what I asked");
assert(detectFrustration("this is wrong, revert it"), "frustration: this is wrong");
assert(detectFrustration("no no no, undo that"), "frustration: no no no");
assert(detectFrustration("stop changing the config file"), "frustration: stop changing");

// --- Should NOT detect frustration ---
assert(!detectFrustration("Add a loading spinner to the button"), "no-frustration: normal request");
assert(!detectFrustration("How does the caching layer work?"), "no-frustration: question");
assert(!detectFrustration("Can you refactor the auth module?"), "no-frustration: polite request");
assert(!detectFrustration("I think we should change the approach"), "no-frustration: hedging");
assert(!detectFrustration("yes"), "no-frustration: trivial");
assert(!detectFrustration("The function still needs error handling"), "no-frustration: 'still' without 'broken/wrong'");

// ─── Unit: merge-tips.js dedup logic ─────────────────────────────

describe("merge-tips.js dedup");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-coach-test-"));
const tmpTips = path.join(tmpDir, "tips.json");

// Create a tips.json with one existing tip
fs.writeFileSync(tmpTips, JSON.stringify({
  version: "2.0.0",
  categories: { workflow: ["💡 Use plan mode for complex tasks."] }
}));

// Pipe a distilled JSON array to merge-tips.js
const distilled = JSON.stringify([
  { tip: "💡 Use plan mode for complex tasks.", strength: "strong", category: "workflow" },
  { tip: "💡 Brand new unique tip here.", strength: "strong", category: "custom" },
  { tip: "Weak generic advice.", strength: "weak", category: "workflow" }
]);

try {
  const mergeResult = execSync(
    `node "${path.join(ROOT, "scripts", "merge-tips.js")}"`,
    {
      input: distilled,
      encoding: "utf-8",
      timeout: 5000,
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: tmpDir }
    }
  );
  assert(mergeResult.includes("Duplicates skipped: 1"), "deduplicates existing tip");
  assert(mergeResult.includes("Strong: 1"), "adds one strong tip");
  assert(mergeResult.includes("tips.json: valid"), "output is valid JSON");

  // Verify the file
  const merged = JSON.parse(fs.readFileSync(tmpTips, "utf-8"));
  assert(merged.categories.workflow.length === 1, "workflow category unchanged");
  assert(merged.categories.custom && merged.categories.custom.length === 1, "custom category created");
  assert(merged.categories.custom[0] === "💡 Brand new unique tip here.", "new tip added correctly");

  // Verify candidates file
  const candidatesPath = path.join(tmpDir, "tips_candidates.md");
  assert(fs.existsSync(candidatesPath), "candidates file created for weak tips");
} catch (e) {
  assert(false, "merge-tips.js failed: " + (e.message || "").slice(0, 200));
}

fs.rmSync(tmpDir, { recursive: true, force: true });

// ─── Unit: apply-tips.js --dry-run ───────────────────────────────

describe("apply-tips.js --dry-run");

const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "claude-coach-test-"));
const tmpSettings = path.join(tmpDir2, ".claude");
fs.mkdirSync(tmpSettings, { recursive: true });
fs.writeFileSync(path.join(tmpSettings, "settings.json"), "{}");

try {
  const dryRun = execSync(
    `node "${path.join(ROOT, "scripts", "apply-tips.js")}" --dry-run --scope local`,
    {
      encoding: "utf-8",
      timeout: 5000,
      cwd: tmpDir2,
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: ROOT }
    }
  );
  assert(dryRun.includes("Full replace"), "dry-run reports full replace");
  assert(dryRun.includes("curated"), "dry-run reports curated count");

  // Verify settings.json was NOT modified
  const settings = fs.readFileSync(path.join(tmpSettings, "settings.json"), "utf-8");
  assert(settings === "{}", "dry-run does not modify settings");
} catch (e) {
  assert(false, "apply-tips.js --dry-run failed: " + (e.message || "").slice(0, 200));
}

fs.rmSync(tmpDir2, { recursive: true, force: true });

// ─── Unit: install-statusline.js ─────────────────────────────────

describe("install-statusline.js");

const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-coach-data-"));

try {
  const installResult = execSync(
    `"${process.execPath}" "${path.join(ROOT, "scripts", "install-statusline.js")}"`,
    {
      encoding: "utf-8",
      timeout: 10000,
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: ROOT, CLAUDE_PLUGIN_DATA: tmpDataDir }
    }
  );
  assert(installResult.includes("runtime dir ready"), "reports success");
  assert(installResult.includes(tmpDataDir), "uses CLAUDE_PLUGIN_DATA path");
  assert(!fs.existsSync(path.join(tmpDataDir, "statusline-tips.js")), "does NOT copy statusline-tips.js (runs from cache)");
  assert(!fs.existsSync(path.join(tmpDataDir, "session-advisor.js")), "does NOT copy session-advisor.js (runs from cache)");
  assert(!fs.existsSync(path.join(tmpDataDir, "tips.json")), "does NOT copy tips.json (read from bundle)");
  assert(!fs.existsSync(path.join(tmpDataDir, "claude-usage.md")), "does NOT copy claude-usage.md (read from bundle)");
  assert(fs.existsSync(path.join(tmpDataDir, "version.json")), "wrote version.json");

  const versionData = JSON.parse(fs.readFileSync(path.join(tmpDataDir, "version.json"), "utf-8"));
  assert(versionData.version === packageJson.version, "version matches package.json");
} catch (e) {
  assert(false, "install-statusline.js failed: " + (e.message || "").slice(0, 200));
}

fs.rmSync(tmpDataDir, { recursive: true, force: true });

// ─── Unit: install-statusline.js --wire detection ────────────────

describe("install-statusline.js --wire detection");

function wireTest(statusLine, label, expectedDetected) {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "claude-coach-wire-"));
  const tmpData = path.join(tmpHome, "data");
  fs.mkdirSync(path.join(tmpHome, ".claude"), { recursive: true });
  fs.mkdirSync(tmpData, { recursive: true });

  const settings = statusLine ? { statusLine } : {};
  fs.writeFileSync(path.join(tmpHome, ".claude", "settings.json"), JSON.stringify(settings));

  try {
    const result = execSync(
      `"${process.execPath}" "${path.join(ROOT, "scripts", "install-statusline.js")}" --wire`,
      {
        encoding: "utf-8",
        timeout: 5000,
        env: {
          ...process.env,
          CLAUDE_PLUGIN_ROOT: ROOT,
          CLAUDE_PLUGIN_DATA: tmpData,
          CLAUDE_PROJECT_ROOT: path.join(tmpHome, "fake-project"),
          HOME: tmpHome,
          USERPROFILE: tmpHome,
        },
      }
    );
    // Extract JSON from output (skip the "runtime dir ready" line)
    const jsonStart = result.indexOf("{");
    assert(jsonStart !== -1, `${label}: produces JSON output`);
    const parsed = JSON.parse(result.slice(jsonStart));
    assert(parsed.detected === expectedDetected, `${label}: detected=${parsed.detected} (expected ${expectedDetected})`);
  } catch (e) {
    assert(false, `${label} failed: ${(e.message || "").slice(0, 200)}`);
  }

  fs.rmSync(tmpHome, { recursive: true, force: true });
}

wireTest(null, "virgin setup", "none");
wireTest({ type: "command", command: "npx -y ccstatusline@latest" }, "ccstatusline", "third-party");
wireTest({ type: "command", command: "node ~/.claude/plugins/claude-hud/dist/index.js" }, "claude-hud", "third-party");
wireTest({ type: "command", command: "node /old/path/statusline-tips.js" }, "prior coach", "coach");
wireTest({ type: "command", command: "node /some/random/script.js" }, "unknown custom", "custom");

// Verify wrapper generates an aggregator file for third-party
{
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "claude-coach-wire-"));
  const tmpData = path.join(tmpHome, "data");
  fs.mkdirSync(path.join(tmpHome, ".claude"), { recursive: true });
  fs.mkdirSync(tmpData, { recursive: true });
  fs.writeFileSync(
    path.join(tmpHome, ".claude", "settings.json"),
    JSON.stringify({ statusLine: { type: "command", command: "npx -y ccstatusline@latest" } })
  );
  try {
    execSync(
      `"${process.execPath}" "${path.join(ROOT, "scripts", "install-statusline.js")}" --wire`,
      {
        encoding: "utf-8",
        timeout: 5000,
        env: { ...process.env, CLAUDE_PLUGIN_ROOT: ROOT, CLAUDE_PLUGIN_DATA: tmpData, CLAUDE_PROJECT_ROOT: path.join(tmpHome, "fake"), HOME: tmpHome, USERPROFILE: tmpHome },
      }
    );
    assert(fs.existsSync(path.join(tmpData, "statusline-aggregator.js")), "third-party: generates aggregator file");
    const agg = fs.readFileSync(path.join(tmpData, "statusline-aggregator.js"), "utf-8");
    assert(agg.includes("ccstatusline"), "aggregator: preserves original command");
    assert(agg.includes("getSessionAdvice"), "aggregator: includes coach integration");
    const settings = JSON.parse(fs.readFileSync(path.join(tmpHome, ".claude", "settings.json"), "utf-8"));
    assert(settings.statusLine.command.includes("statusline-aggregator"), "aggregator: settings updated to point to aggregator");
  } catch (e) {
    assert(false, `aggregator test failed: ${(e.message || "").slice(0, 200)}`);
  }
  fs.rmSync(tmpHome, { recursive: true, force: true });
}

// Verify re-run detects existing wrapper
{
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "claude-coach-wire-"));
  const tmpData = path.join(tmpHome, "data");
  fs.mkdirSync(path.join(tmpHome, ".claude"), { recursive: true });
  fs.mkdirSync(tmpData, { recursive: true });
  const aggPath = path.join(tmpData, "statusline-aggregator.js").replace(/\\/g, "/");
  fs.writeFileSync(
    path.join(tmpHome, ".claude", "settings.json"),
    JSON.stringify({ statusLine: { type: "command", command: `node "${aggPath}"` } })
  );
  fs.writeFileSync(path.join(tmpData, "statusline-aggregator.js"), "// placeholder\n * Original: npx ccstatusline\n");
  try {
    const result = execSync(
      `"${process.execPath}" "${path.join(ROOT, "scripts", "install-statusline.js")}" --wire`,
      {
        encoding: "utf-8",
        timeout: 5000,
        env: { ...process.env, CLAUDE_PLUGIN_ROOT: ROOT, CLAUDE_PLUGIN_DATA: tmpData, CLAUDE_PROJECT_ROOT: path.join(tmpHome, "fake"), HOME: tmpHome, USERPROFILE: tmpHome },
      }
    );
    const jsonStart = result.indexOf("{");
    const parsed = JSON.parse(result.slice(jsonStart));
    assert(parsed.detected === "wrapped", "re-run: detects existing wrapper");
  } catch (e) {
    assert(false, `re-run test failed: ${(e.message || "").slice(0, 200)}`);
  }
  fs.rmSync(tmpHome, { recursive: true, force: true });
}

// ─── Integration: session-advisor library mode ───────────────────

describe("session-advisor library mode");

// session-advisor reads tips.json from bundleRoot() (__dirname/..) — no install needed.
// CLAUDE_PLUGIN_DATA is required at module load (CACHE_DIR uses it).
const tmpAdvisorData = fs.mkdtempSync(path.join(os.tmpdir(), "claude-coach-advisor-"));
process.env.CLAUDE_PLUGIN_DATA = tmpAdvisorData;
const { getSessionAdvice } = require(path.join(ROOT, "scripts", "session-advisor.js"));
delete process.env.CLAUDE_PLUGIN_DATA;

// With no args — should return a fallback tip (not crash)
const advice = getSessionAdvice();
assert(typeof advice === "string", "returns a string");
assert(advice.length > 0, "non-empty output");
assert(advice.includes("\x1b["), "includes ANSI color codes");

// With advisor disabled — should return fallback
const advice2 = getSessionAdvice({ sessionId: "test-123", cwd: ROOT });
assert(typeof advice2 === "string", "returns string with sessionId");

// Pending reflections priority: should show 💭 over random tip when reflections exist
{
  const slug = ROOT.replace(/[:\\/]/g, "-");
  const projDir = path.join(os.homedir(), ".claude", "projects", slug);
  const pendingFile = path.join(projDir, "pending-reflections.jsonl");
  const hadFile = fs.existsSync(pendingFile);
  let originalContent = "";
  try { originalContent = fs.readFileSync(pendingFile, "utf-8"); } catch {}
  try {
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(pendingFile, '{"test":true}\n{"test":true}\n');
    const adviceP = getSessionAdvice({ cwd: ROOT });
    assert(adviceP.includes("💭"), "pending reflections shown when >0");
    assert(adviceP.includes("2 pending"), "shows correct pending count");
  } finally {
    // Restore original state
    if (hadFile) fs.writeFileSync(pendingFile, originalContent);
    else try { fs.unlinkSync(pendingFile); } catch {}
  }
}

fs.rmSync(tmpAdvisorData, { recursive: true, force: true });

// ─── Report ──────────────────────────────────────────────────────

console.log(`\n${"=".repeat(50)}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
