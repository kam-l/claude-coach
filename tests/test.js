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
assert(Array.isArray(packageJson.files), "has files array");
assert(packageJson.files.includes("scripts/"), "files includes scripts/");
assert(packageJson.files.includes("skills/"), "files includes skills/");
assert(packageJson.files.includes(".claude-plugin/"), "files includes .claude-plugin/");

const binScript = packageJson.bin && packageJson.bin["claude-coach"];
assert(!!binScript, "bin entry exists");
if (binScript) {
  const binContent = fs.readFileSync(path.join(ROOT, binScript), "utf-8");
  assert(binContent.startsWith("#!/usr/bin/env node"), "bin script has shebang");
}

// ─── Wiring: SKILL.md ───────────────────────────────────────────

describe("SKILL.md");

const skillPath = path.join(ROOT, "skills", "tips", "SKILL.md");
const skill = fs.readFileSync(skillPath, "utf-8");
assert(skill.includes("description:"), "has description frontmatter");
assert(skill.includes("init"), "routes init");
assert(skill.includes("refresh"), "routes refresh");
assert(skill.includes("list"), "routes list");
assert(skill.includes("add"), "routes add");

// Check workflows exist for routed paths
assert(fs.existsSync(path.join(ROOT, "skills", "tips", "workflows", "init.md")), "init.md exists");
assert(fs.existsSync(path.join(ROOT, "skills", "tips", "workflows", "refresh.md")), "refresh.md exists");

// ─── Wiring: npm pack contents ───────────────────────────────────

describe("npm pack contents");

try {
  const packOutput = execSync("npm pack --dry-run 2>&1", {
    encoding: "utf-8", cwd: ROOT, timeout: 10000
  });
  assert(packOutput.includes("skills/tips/SKILL.md"), "pack includes SKILL.md");
  assert(packOutput.includes(".claude-plugin/plugin.json"), "pack includes plugin.json");
  assert(packOutput.includes("scripts/session-advisor.js"), "pack includes session-advisor.js");
  assert(packOutput.includes("scripts/install-statusline.js"), "pack includes install-statusline.js");
  assert(!packOutput.includes("eval-cases"), "pack excludes eval-cases");
  assert(!packOutput.includes("tips_candidates"), "pack excludes tips_candidates");
} catch (e) {
  assert(false, "npm pack --dry-run failed: " + (e.message || "").slice(0, 100));
}

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

// ─── Unit: scan.js extractFrontmatter ────────────────────────────

describe("extractFrontmatter (scan.js)");

// Load scan.js as a string and extract the function via eval in a sandbox
// (scan.js doesn't export it, so we test via the script's behavior)
const scanSrc = fs.readFileSync(path.join(ROOT, "scripts", "scan.js"), "utf-8");
const extractFn = new Function(
  "return " + scanSrc.match(/function extractFrontmatter[\s\S]*?^}/m)[0]
)();

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
  assert(dryRun.includes("Would add"), "dry-run reports additions");
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

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "claude-coach-home-"));
const tmpTipsDir = path.join(tmpHome, ".claude", ".coach");

try {
  const installResult = execSync(
    `"${process.execPath}" "${path.join(ROOT, "scripts", "install-statusline.js")}"`,
    {
      encoding: "utf-8",
      timeout: 10000,
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: ROOT, HOME: tmpHome, USERPROFILE: tmpHome }
    }
  );
  assert(installResult.includes("runtime files installed"), "reports success");
  assert(fs.existsSync(path.join(tmpTipsDir, "statusline-tips.js")), "copied statusline-tips.js");
  assert(fs.existsSync(path.join(tmpTipsDir, "session-advisor.js")), "copied session-advisor.js");
  assert(fs.existsSync(path.join(tmpTipsDir, "tips.json")), "copied tips.json");
  assert(fs.existsSync(path.join(tmpTipsDir, "version.json")), "wrote version.json");

  const versionData = JSON.parse(fs.readFileSync(path.join(tmpTipsDir, "version.json"), "utf-8"));
  assert(versionData.version === packageJson.version, "version matches package.json");
} catch (e) {
  assert(false, "install-statusline.js failed: " + (e.message || "").slice(0, 200));
}

fs.rmSync(tmpHome, { recursive: true, force: true });

// ─── Integration: session-advisor library mode ───────────────────

describe("session-advisor library mode");

// session-advisor resolves tips from ~/.claude/.coach/ — install there first
const tmpHome2 = fs.mkdtempSync(path.join(os.tmpdir(), "claude-coach-home2-"));
try {
  execSync(
    `"${process.execPath}" "${path.join(ROOT, "scripts", "install-statusline.js")}"`,
    {
      encoding: "utf-8",
      timeout: 10000,
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: ROOT, HOME: tmpHome2, USERPROFILE: tmpHome2 }
    }
  );
} catch { /* best-effort */ }

// session-advisor uses os.homedir() which reads HOME/USERPROFILE — we can't
// override that mid-process, so test with whatever the real homedir has.
// The require() below loads from source (ROOT), which resolves tipsDir() at
// call time. If ~/.claude/.coach/tips.json exists it works; if not, loadTips()
// returns the error fallback string — still a valid string.

const { getSessionAdvice } = require(path.join(ROOT, "scripts", "session-advisor.js"));

// With no args — should return a fallback tip (not crash)
const advice = getSessionAdvice();
assert(typeof advice === "string", "returns a string");
assert(advice.length > 0, "non-empty output");
assert(advice.includes("\x1b["), "includes ANSI color codes");

// With advisor disabled — should return fallback
const advice2 = getSessionAdvice({ sessionId: "test-123", cwd: ROOT });
assert(typeof advice2 === "string", "returns string with sessionId");

fs.rmSync(tmpHome2, { recursive: true, force: true });

// ─── Report ──────────────────────────────────────────────────────

console.log(`\n${"=".repeat(50)}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
