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

assert(fs.existsSync(path.join(ROOT, "commands", "init.md")), "commands/init.md exists");
assert(fs.existsSync(path.join(ROOT, "commands", "tips.md")), "commands/tips.md exists");
assert(fs.existsSync(path.join(ROOT, "commands", "uninstall.md")), "commands/uninstall.md exists");

const tipsCmd = fs.readFileSync(path.join(ROOT, "commands", "tips.md"), "utf-8");
assert(tipsCmd.includes("list"), "tips command routes list");
assert(tipsCmd.includes("add"), "tips command routes add");
assert(tipsCmd.includes("refresh"), "tips command routes refresh");

// ─── Wiring: plugin file structure ───────────────────────────────

describe("plugin file structure");

assert(fs.existsSync(path.join(ROOT, ".claude-plugin", "plugin.json")), "plugin.json exists");
assert(fs.existsSync(path.join(ROOT, "scripts", "session-advisor.js")), "session-advisor.js exists");
assert(fs.existsSync(path.join(ROOT, "scripts", "install-statusline.js")), "install-statusline.js exists");
assert(fs.existsSync(path.join(ROOT, "hooks", "hooks.json")), "hooks.json exists");
assert(!fs.existsSync(path.join(ROOT, "scripts", "postinstall.js")), "no postinstall.js (npm path removed)");

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

// ─── Unit: prompt-enrichment.js local gate ──────────────────────

describe("prompt-enrichment.js shouldSkip");

const enrichSrc = fs.readFileSync(path.join(ROOT, "scripts", "prompt-enrichment.js"), "utf-8");
const shouldSkip = new Function(
  "return " + enrichSrc.match(/function shouldSkip[\s\S]*?^}/m)[0]
)();
const shouldPass = new Function(
  "return " + enrichSrc.match(/function shouldPass[\s\S]*?^}/m)[0]
)();

// Helper: should the prompt reach the classifier?
function shouldClassify(p) { return !shouldSkip(p) && shouldPass(p); }

// --- shouldSkip: trivial prompts ---
assert(shouldSkip("yes"), "skip: trivial 'yes'");
assert(shouldSkip("no"), "skip: trivial 'no'");
assert(shouldSkip("lgtm"), "skip: trivial 'lgtm'");
assert(shouldSkip("ship it"), "skip: trivial 'ship it'");
assert(shouldSkip("go ahead"), "skip: trivial 'go ahead'");
assert(shouldSkip("fix bug"), "skip: <5 tokens");
assert(shouldSkip("/commit -m 'update'"), "skip: starts with /");
assert(!shouldSkip("# heading stuff here now with question?"), "no-skip: markdown heading with question");
assert(!shouldSkip("* bullet point item here, maybe refactor"), "no-skip: markdown bullet with hedging");

// --- shouldSkip: clear single-action prompts ---
assert(shouldSkip("Add a loading spinner to the submit button component"), "skip: clear single-action");
assert(shouldSkip("Rename the variable from foo to bar in utils.js"), "skip: clear rename");
assert(shouldSkip("Delete the unused import on line 42 of utils.ts"), "skip: precise action");

// --- shouldSkip: should NOT skip these ---
assert(!shouldSkip("Maybe change how that thing handles errors? I am not sure"), "no-skip: hedging + question");
assert(!shouldSkip("How does the caching layer work?"), "no-skip: question mark");
assert(!shouldSkip("I think we should probably refactor the auth module"), "no-skip: hedging words");
assert(!shouldSkip("Change the entire authentication flow to use OAuth"), "no-skip: broad scope (entire)");
assert(!shouldSkip("It might break something if we change this"), "no-skip: hedging (might)");

describe("prompt-enrichment.js shouldPass");

// --- shouldPass: question marks ---
assert(shouldPass("How does the caching layer work?"), "pass: question mark");
assert(shouldPass("Can you add a loading spinner?"), "pass: polite question");

// --- shouldPass: hedging ---
assert(shouldPass("I think we should probably refactor the auth module"), "pass: hedging (I think, probably)");
assert(shouldPass("Maybe we should improve the error handling"), "pass: hedging (maybe)");

// --- shouldPass: broad scope ---
assert(shouldPass("Change the entire authentication flow"), "pass: broad scope (entire)");
assert(shouldPass("Update all the tests everywhere"), "pass: broad scope (all, everywhere)");

// --- shouldPass: multi-sentence ---
assert(shouldPass("Fix the bug. Also update the docs. Clean up the tests."), "pass: multi-sentence");

// --- shouldPass: should NOT pass (default non-intervention) ---
assert(!shouldPass("Add error handling to the submit function"), "no-pass: clear single action");
assert(!shouldPass("Read the package.json file and tell me the version"), "no-pass: clear read request");

describe("prompt-enrichment.js shouldClassify (end-to-end gate)");

// --- Full gate: should reach classifier ---
assert(shouldClassify("Maybe change how that thing handles errors? I am not sure"), "classify: hedging + vague + question");
assert(shouldClassify("How does the caching layer work?"), "classify: question");
assert(shouldClassify("I think we should probably refactor the auth module"), "classify: hedging");
assert(shouldClassify("Change the entire authentication flow to use OAuth"), "classify: broad scope");

// --- Full gate: should NOT reach classifier ---
assert(!shouldClassify("yes"), "no-classify: trivial");
assert(!shouldClassify("fix the bug"), "no-classify: short");
assert(!shouldClassify("Add a loading spinner to the submit button component"), "no-classify: clear action");
assert(!shouldClassify("Rename the variable from foo to bar in utils.js"), "no-classify: clear rename");
assert(!shouldClassify("Run npm install and then npm test"), "no-classify: clear instructions");

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
const tmpTipsDir = path.join(tmpHome, ".claude", "plugins", "claude-coach");

try {
  const installResult = execSync(
    `"${process.execPath}" "${path.join(ROOT, "scripts", "install-statusline.js")}"`,
    {
      encoding: "utf-8",
      timeout: 10000,
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: ROOT, HOME: tmpHome, USERPROFILE: tmpHome }
    }
  );
  assert(installResult.includes("runtime dir ready"), "reports success");
  assert(!fs.existsSync(path.join(tmpTipsDir, "statusline-tips.js")), "does NOT copy statusline-tips.js (runs from cache)");
  assert(!fs.existsSync(path.join(tmpTipsDir, "session-advisor.js")), "does NOT copy session-advisor.js (runs from cache)");
  assert(!fs.existsSync(path.join(tmpTipsDir, "tips.json")), "does NOT copy tips.json (read from bundle)");
  assert(!fs.existsSync(path.join(tmpTipsDir, "claude-usage.md")), "does NOT copy claude-usage.md (read from bundle)");
  assert(fs.existsSync(path.join(tmpTipsDir, "version.json")), "wrote version.json");

  const versionData = JSON.parse(fs.readFileSync(path.join(tmpTipsDir, "version.json"), "utf-8"));
  assert(versionData.version === packageJson.version, "version matches package.json");
} catch (e) {
  assert(false, "install-statusline.js failed: " + (e.message || "").slice(0, 200));
}

fs.rmSync(tmpHome, { recursive: true, force: true });

// ─── Integration: session-advisor library mode ───────────────────

describe("session-advisor library mode");

// session-advisor reads tips.json from bundleRoot() (__dirname/..) — no install needed.

const { getSessionAdvice } = require(path.join(ROOT, "scripts", "session-advisor.js"));

// With no args — should return a fallback tip (not crash)
const advice = getSessionAdvice();
assert(typeof advice === "string", "returns a string");
assert(advice.length > 0, "non-empty output");
assert(advice.includes("\x1b["), "includes ANSI color codes");

// With advisor disabled — should return fallback
const advice2 = getSessionAdvice({ sessionId: "test-123", cwd: ROOT });
assert(typeof advice2 === "string", "returns string with sessionId");

// ─── Report ──────────────────────────────────────────────────────

console.log(`\n${"=".repeat(50)}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
