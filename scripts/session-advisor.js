#!/usr/bin/env node
/**
 * Session advisor — dual-mode module.
 *
 * Library mode (require):
 *   const { getSessionAdvice } = require("claude-coach/scripts/session-advisor");
 *   console.log(getSessionAdvice({ sessionId, cwd }));
 *
 * Worker mode (CLI):
 *   node session-advisor.js --update <sessionId> <cwd>
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

const FG = "\x1b[38;5;248m";
const RST = "\x1b[0m";

// Fallback needed: library mode callers (custom statusline) don't have CLAUDE_PLUGIN_DATA
const DATA_DIR = process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), ".claude", "plugins", "claude-coach");
const CACHE_DIR = path.join(DATA_DIR, "cache");
const HOME = os.homedir();

// ─── Shared helpers ──────────────────────────────────────────────

function dataDir() {
  return DATA_DIR;
}

function bundleRoot() {
  // When running from the runtime dir, version.json records the source path.
  try {
    const v = JSON.parse(fs.readFileSync(path.join(__dirname, "version.json"), "utf-8"));
    if (v.source) return v.source;
  } catch {}
  // Fallback: assume we're in scripts/ subdir of the bundle (dev/test mode).
  return path.resolve(__dirname, "..");
}

function loadTips() {
  const tipsFile = path.join(bundleRoot(), "tips.json");
  try {
    const db = JSON.parse(fs.readFileSync(tipsFile, "utf-8"));
    return Object.values(db.categories).flat();
  } catch {
    return ["Check tips.json — file not found or malformed."];
  }
}

function stableIndex(pool, holdSeconds) {
  return Math.floor(Date.now() / (holdSeconds * 1000)) % pool.length;
}

function cachePath(sid) {
  return path.join(CACHE_DIR, `advice-${sid}.json`);
}

function lockPath(sid) {
  return path.join(CACHE_DIR, `update-${sid}.lock`);
}

function intervalSeconds() {
  const env = process.env.CLAUDE_COACH_INTERVAL;
  if (env) {
    const n = parseInt(env, 10);
    if (n > 0) return n * 60;
  }
  return 300;
}

function isLockStale(lockFile) {
  try {
    const content = fs.readFileSync(lockFile, "utf-8");
    const [pidStr, tsStr] = content.split("\n");
    const pid = parseInt(pidStr, 10);
    const ts = parseInt(tsStr, 10);
    // Stale if > 120s old
    if (Date.now() - ts > 120000) return true;
    // Stale if PID is dead
    try {
      process.kill(pid, 0);
      return false; // alive
    } catch {
      return true; // dead
    }
  } catch {
    return true;
  }
}

// ─── Library mode ────────────────────────────────────────────────

function getSessionAdvice({ sessionId, cwd } = {}) {
  // Gate: advisor disabled → fallback
  const envVal = process.env.CLAUDE_COACH;
  if (!envVal || envVal === "0") {
    return fallbackTip(false, cwd);
  }

  // No session ID → fallback
  if (!sessionId) {
    return fallbackTip(false, cwd);
  }

  // Try reading cache
  const cache = readCache(sessionId);
  if (cache) {
    const age = Date.now() - cache.timestamp;
    if (age < intervalSeconds() * 1000 && cache.tips && cache.tips.length > 0) {
      const idx = stableIndex(cache.tips, 30);
      const prefix = cache.strength === "inject" ? "⚠️" : "ℹ️";
      const tip = cache.tips[idx].replace(/^💡/, prefix);
      const cost = cache.cost_usd && process.env.CLAUDE_COACH_COSTS ? ` [$${cache.cost_usd.toFixed(2)}]` : "";
      return `\n${FG}${tip}${cost}${RST}`;
    }
  }

  // Cache stale or missing — try to spawn worker
  maybeSpawnWorker(sessionId, cwd);

  // Return fallback for this render cycle; show 🔍 while worker is active
  const lock = lockPath(sessionId);
  const analyzing = fs.existsSync(lock) && !isLockStale(lock);
  return fallbackTip(analyzing, cwd);
}

function readCache(sid) {
  try {
    const raw = fs.readFileSync(cachePath(sid), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function pendingReflectionCount(cwd) {
  try {
    const slug = (cwd || "global").replace(/[/\\]+$/, "").replace(/[:\\/]/g, "-");
    const file = path.join(HOME, ".claude", "projects", slug, "pending-reflections.jsonl");
    if (!fs.existsSync(file)) return 0;
    const lines = fs.readFileSync(file, "utf-8").trim().split("\n").filter(Boolean);
    return lines.length;
  } catch {
    return 0;
  }
}

function fallbackTip(analyzing, cwd) {
  const pool = loadTips();
  const pending = pendingReflectionCount(cwd);
  if (pending > 0) {
    return `\n${FG}💭 ${pending} pending reflection${pending > 1 ? "s" : ""} — /reflect to review${RST}`;
  }
  const idx = stableIndex(pool, 30);
  const prefix = analyzing ? "\u{1F50D} " : "";
  return `\n${FG}${prefix}${pool[idx]}${RST}`;
}

function maybeSpawnWorker(sid, cwd) {
  const lock = lockPath(sid);
  try {
    // If lock exists and not stale, worker is already running
    if (fs.existsSync(lock) && !isLockStale(lock)) return;
  } catch {}

  if (!cwd) return;

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const child = spawn(
      process.execPath,
      [__filename, "--update", sid, cwd],
      { detached: true, stdio: "ignore", windowsHide: true }
    );
    child.unref();
  } catch {}
}

// ─── Worker mode ─────────────────────────────────────────────────

function runWorker(sessionId, cwd) {
  const lock = lockPath(sessionId);
  try {
    // Housekeeping: delete old cache files (> 24h)
    cleanOldCaches();

    // Acquire lock (atomic)
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    try {
      fs.writeFileSync(lock, `${process.pid}\n${Date.now()}`, { flag: "wx" });
    } catch (e) {
      if (e.code === "EEXIST") {
        if (!isLockStale(lock)) {
          process.exit(0); // worker already running
        }
        // Stale lock — remove and retry
        try { fs.unlinkSync(lock); } catch {}
        try {
          fs.writeFileSync(lock, `${process.pid}\n${Date.now()}`, { flag: "wx" });
        } catch {
          process.exit(0); // lost race
        }
      } else {
        process.exit(0);
      }
    }

    // Derive JSONL path
    const slug = cwd.replace(/[:\\/]/g, "-");
    const jsonlPath = path.join(HOME, ".claude", "projects", slug, sessionId + ".jsonl");
    if (!fs.existsSync(jsonlPath)) {
      return; // no transcript yet — exit gracefully
    }

    // Idle check: skip if transcript hasn't changed since last advice
    try {
      const transcriptMtime = fs.statSync(jsonlPath).mtimeMs;
      const cache = readCache(sessionId);
      if (cache && cache.timestamp && transcriptMtime < cache.timestamp) {
        return; // transcript unchanged since last cycle — no wasted Sonnet call
      }
    } catch {}

    // Read JSONL (last 64KB)
    const transcript = readTranscript(jsonlPath);
    if (!transcript) return;

    // Read pre-mined setup context (commands, skills, friction, tips)
    let setupContext = "";
    try {
      setupContext = fs.readFileSync(path.join(dataDir(), "setup-context.md"), "utf-8");
      if (setupContext.length > 8000) setupContext = setupContext.slice(0, 8000);
    } catch {}

    // Read knowledge (general Claude Code patterns)
    const knowledgePath = path.join(bundleRoot(), "references", "claude-usage.md");
    let knowledge = "";
    try { knowledge = fs.readFileSync(knowledgePath, "utf-8"); } catch {}

    // Resolve claude path
    const claudePath = resolveClaudePath();

    // Build prompt
    const prompt = buildPrompt(setupContext, knowledge, transcript);

    // Spawn claude
    const result = spawnSync(claudePath, ["-p", "--model", "sonnet", "--effort", "low", "--max-turns", "1", "--max-budget-usd", "0.05", "--output-format", "json", "--tools", "", "--no-chrome", "--strict-mcp-config", "--system-prompt", "", "--disable-slash-commands", "--no-session-persistence"], {
      input: prompt,
      timeout: 60000,
      encoding: "utf-8",
      windowsHide: true,
    });

    if (result.error || result.status !== 0) return;

    // Parse JSON envelope from --output-format json
    let envelope, output;
    try {
      envelope = JSON.parse((result.stdout || "").trim());
      output = (envelope.result || "").trim();
    } catch {
      // Fallback: treat stdout as plain text (older claude versions)
      output = (result.stdout || "").trim();
    }

    // Strip markdown fences
    output = output.replace(/^\s*```json?\s*/gm, "").replace(/\s*```\s*$/gm, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch {
      return; // non-JSON response — exit gracefully
    }

    if (!parsed.tips || !Array.isArray(parsed.tips) || parsed.tips.length === 0) return;

    const costUsd = envelope?.total_cost_usd || null;

    // Write cache (atomic, Windows-safe)
    const cacheFile = cachePath(sessionId);
    const tmpFile = cacheFile + ".tmp";
    const cacheData = JSON.stringify({
      session_id: sessionId,
      tips: parsed.tips,
      strength: parsed.strength || "display",
      cost_usd: costUsd,
      timestamp: Date.now(),
    });

    fs.writeFileSync(tmpFile, cacheData);
    atomicRename(tmpFile, cacheFile);

  } finally {
    try { fs.unlinkSync(lock); } catch {}
  }
}

function readTranscript(jsonlPath) {
  try {
    const fd = fs.openSync(jsonlPath, "r");
    const stat = fs.fstatSync(fd);
    const size = stat.size;
    const readSize = Math.min(size, 131072);
    const offset = size - readSize;
    const buffer = Buffer.alloc(readSize);
    fs.readSync(fd, buffer, 0, readSize, offset);
    fs.closeSync(fd);

    let raw = buffer.toString("utf-8");

    // Discard first partial line if we seeked
    if (offset > 0) {
      const nlIdx = raw.indexOf("\n");
      if (nlIdx !== -1) raw = raw.slice(nlIdx + 1);
      else return null; // entire chunk is one partial line
    }

    const lines = raw.split("\n").filter(Boolean);
    const parts = [];
    let totalLen = 0;

    for (const line of lines) {
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }

      // Skip meta entries
      if (entry.isMeta) continue;
      const type = entry.type;
      if (["progress", "file-history-snapshot", "system", "queue-operation"].includes(type)) continue;

      if (type === "user" && entry.message && typeof entry.message.content === "string") {
        // Strip system-reminder tags and their content
        const cleaned = entry.message.content
          .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
          .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, "")
          .replace(/<available-deferred-tools>[\s\S]*?<\/available-deferred-tools>/g, "")
          .trim();
        if (!cleaned) continue;
        const text = `[User]: ${cleaned}`;
        parts.push(text);
        totalLen += text.length;
      } else if (type === "assistant" && entry.message && Array.isArray(entry.message.content)) {
        for (const block of entry.message.content) {
          if (block.type === "text" && block.text) {
            const text = `[Assistant]: ${block.text}`;
            parts.push(text);
            totalLen += text.length;
          }
          // Skip thinking, tool_use, tool_result
        }
      }

      if (totalLen > 32000) break;
    }

    return parts.length > 0 ? parts.join("\n\n") : null;
  } catch {
    return null;
  }
}

function resolveClaudePath() {
  const cmd = process.platform === "win32" ? "where claude" : "which claude";
  try {
    const result = spawnSync(cmd.split(" ")[0], cmd.split(" ").slice(1), {
      encoding: "utf-8",
      timeout: 5000,
      windowsHide: true,
    });
    const firstLine = (result.stdout || "").split("\n")[0].trim();
    if (firstLine) return firstLine;
  } catch {}
  return "claude";
}

function buildPrompt(setupContext, knowledge, transcript) {
  return `Analyze a Claude Code session transcript. Return 1-3 tips the HUMAN operator should act on now. Tips appear on a one-line statusline — glanced at between tool calls.

## Hard rules
- Every tip references something SPECIFIC from the transcript: a file, command, pattern, or decision
- When an existing tip from the library matches the session, surface it VERBATIM — don't invent a worse version
- When recommending a tool, use the EXACT command name from the setup reference below
- Tips address the HUMAN operator, never the AI
- Never mention tool calls, JSON structures, or system tags — stripped metadata
- Insufficient transcript → {"tips":[],"reasoning":"insufficient context"}

## Watch for these situations (Boris Cherny + team best practices)
- User correcting Claude repeatedly → suggest \`/clear\` and rewriting the prompt
- Multi-file changes without plan mode → suggest \`Shift+Tab\` to enter plan mode
- NEVER suggest /compact or /clear for context management — the user manages context themselves. /clear IS appropriate for topic changes or repeated-correction recovery.
- User describing file locations in prose → suggest \`@path\` references instead
- Large feature request without scoping → suggest interview pattern first
- User pasting long logs/data inline → suggest piping: \`cat file | claude\`
- Unscoped exploration reading many files → say "use subagents" to throw compute
- User hasn't committed in a while → suggest committing to checkpoint progress
- Code changes without tests → suggest giving Claude a way to verify (2-3x quality)
- User mixing unrelated tasks → suggest \`/clear\` between topics
- Same bug fix attempted twice → suggest \`/rewind\` + different approach
- Session continuing from previous work → mention \`--continue\` / \`--resume\`
- Mediocre fix landed → "scrap this — implement the elegant solution you now see"
- User micromanaging a bug fix → "paste the bug, say fix — don't micromanage how"
- Repeated workflow done manually → "if >1x/day, make it a /command"
- User doing everything in one session → suggest parallel worktrees (3-5 Claudes)
- CLAUDE.md correction made → "Update CLAUDE.md so you don't repeat this"
- Complex problem, no subagents → "say 'use subagents' for more compute"
- User struggling with permissions → suggest \`/sandbox\` (84% fewer prompts)

## Watch for Claude going wrong (transcript-level — hooks can't catch these)
- Claude adding files/abstractions not requested (look for "I'll also add...", "While I'm at it...", "Let me also create...") → suggest telling Claude "stop, only what I asked for"
- Claude's actions contradict a rule the user previously stated or corrected in the transcript → suggest pointing out the specific rule
- Response length vastly exceeds task complexity (multi-paragraph explanation for a 5-line change, or listing every step of a simple fix) → suggest "just the code, no explanation"
- Large task started without scoping or confirmation (Claude immediately edits files on a broad request without asking questions or planning) → suggest "stop, scope this first" or \`/think\`

${setupContext ? `## User's setup and coaching reference\n${setupContext}` : ""}

${knowledge ? `## Interaction patterns\n${knowledge}` : ""}

## Session transcript
${transcript}

## Output
ONLY a JSON object — no markdown fences, no commentary.

{"tips":["💡 tip1","💡 tip2"],"strength":"inject|display|skip","reasoning":"one-line rationale"}

strength: "inject" = strong, session-specific, Claude should act on this now.
strength: "display" = worth showing in statusline, not worth injecting.
strength: "skip" = nothing actionable right now.
For adversarial observations (Claude going wrong): use "inject" when 3+ transcript signals confirm the pattern. Use "display" for first sighting.

Each tip: 💡 prefix, max 80 chars. NEVER include cost/price figures in tips. Generic advice = failure.

Good: "💡 Run tests before committing the auth middleware changes"
Good: "💡 Commit the auth changes before starting the refactor"
Good: "💡 Use /fix — methodical debugging beats trial and error here"
Bad:  "💡 Always write tests for your code" — generic, no transcript reference
Bad:  "💡 Claude used Edit on config.js" — references AI internals, not actionable`;
}

function cleanOldCaches() {
  try {
    if (!fs.existsSync(CACHE_DIR)) return;
    const now = Date.now();
    for (const name of fs.readdirSync(CACHE_DIR)) {
      if (!name.startsWith("advice-") || !name.endsWith(".json")) continue;
      const file = path.join(CACHE_DIR, name);
      try {
        const stat = fs.statSync(file);
        if (now - stat.mtimeMs > 86400000) {
          fs.unlinkSync(file);
        }
      } catch {}
    }
  } catch {}
}

function atomicRename(src, dest) {
  for (let i = 0; i < 3; i++) {
    try {
      try { fs.unlinkSync(dest); } catch {}
      fs.renameSync(src, dest);
      return;
    } catch (e) {
      if (i < 2 && e.code === "EPERM") {
        spawnSync(process.execPath, ["-e", "setTimeout(()=>{},100)"], { timeout: 200 });
        continue;
      }
      throw e;
    }
  }
}

// ─── Entrypoint ──────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === "--update" && args[1] && args[2]) {
    try {
      runWorker(args[1], args[2]);
    } catch {
      // Fail-open: never crash the worker visibly
    }
    process.exit(0);
  } else {
    // Standalone: output a tip (backward compat)
    process.stdout.write(getSessionAdvice({}));
  }
}

module.exports = { getSessionAdvice };
