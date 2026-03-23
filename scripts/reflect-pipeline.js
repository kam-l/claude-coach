#!/usr/bin/env node
/**
 * Reflection pipeline — runs as detached child after session ends.
 *
 * Stage 1 (Haiku): Extract signals from transcript.
 *   Input: user+assistant conversation lines
 *   Output: { signals: [{type, quote, context}], has_learnings: bool }
 *
 * Stage 2 (Sonnet): Generate reflections from signals.
 *   Input: extracted signals + MEMORY.md content
 *   Output: { memories: [{name, content}], tips: [string] }
 *
 * Result: Written to ${CLAUDE_PLUGIN_DATA}/pending-reflections/{timestamp}.json
 *
 * Cost ceiling: ~$0.05/session target. Haiku budget tracked cumulatively ($0.04 cap), Sonnet capped at $0.04 per call.
 *
 * Usage: node reflect-pipeline.js <transcript_path> <session_id> [cwd]
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const DATA_DIR = process.env.CLAUDE_PLUGIN_DATA;
if (!DATA_DIR) process.exit(0);

const LOCK_FILE = path.join(DATA_DIR, "reflect.lock");
const PENDING_DIR = path.join(DATA_DIR, "pending-reflections");
const HOME = os.homedir();

// Haiku token budget per chunk (~4 chars/token, leave room for prompt)
const CHUNK_CHARS = 24000; // ~6k tokens of transcript per Haiku call
const MAX_HAIKU_CALLS = 8; // $0.05 ceiling with margin

// ─── Main ────────────────────────────────────────────────────────

const [,, transcriptPath, sessionId, cwd] = process.argv;
if (!transcriptPath || !sessionId) process.exit(0);

try {
  // Acquire lock
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LOCK_FILE, `${process.pid}\n${Date.now()}`, { flag: "wx" });
} catch (e) {
  if (e.code === "EEXIST") {
    // Check for stale lock (> 5 min = crashed pipeline)
    try {
      const content = fs.readFileSync(LOCK_FILE, "utf-8");
      const lockTs = parseInt(content.split("\n")[1], 10);
      if (Date.now() - lockTs > 300000) {
        fs.unlinkSync(LOCK_FILE);
        fs.writeFileSync(LOCK_FILE, `${process.pid}\n${Date.now()}`, { flag: "wx" });
      } else {
        process.exit(0); // another pipeline running
      }
    } catch {
      process.exit(0); // lost race or read failed
    }
  } else {
    process.exit(0);
  }
}

try {
  run();
} finally {
  try { fs.unlinkSync(LOCK_FILE); } catch {}
}

function run() {
  // Read and parse transcript
  const lines = readTranscript(transcriptPath);
  if (!lines || lines.length < 20) return; // too short to learn from

  // Stage 1: Haiku extraction
  const signals = extractSignals(lines);
  if (!signals || signals.length === 0) return;

  // Stage 2: Sonnet reflection
  const reflection = generateReflection(signals);
  if (!reflection) return;

  // Write pending reflection
  fs.mkdirSync(PENDING_DIR, { recursive: true });
  const ts = Date.now();
  const pending = {
    timestamp: ts,
    session_id: sessionId,
    cwd: cwd || null,
    signals,
    reflection,
  };
  fs.writeFileSync(
    path.join(PENDING_DIR, `${ts}.json`),
    JSON.stringify(pending, null, 2)
  );
}

// ─── Transcript parsing ──────────────────────────────────────────

function readTranscript(jsonlPath) {
  try {
    const raw = fs.readFileSync(jsonlPath, "utf-8");
    const jsonLines = raw.split("\n").filter(Boolean);
    const parts = [];

    for (const line of jsonLines) {
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }

      if (entry.isMeta) continue;
      const type = entry.type;
      if (["progress", "file-history-snapshot", "system", "queue-operation"].includes(type)) continue;

      if (type === "user" && entry.message && typeof entry.message.content === "string") {
        const cleaned = entry.message.content
          .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
          .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, "")
          .replace(/<available-deferred-tools>[\s\S]*?<\/available-deferred-tools>/g, "")
          .trim();
        if (!cleaned) continue;
        parts.push({ role: "user", content: cleaned });
      } else if (type === "assistant" && entry.message && Array.isArray(entry.message.content)) {
        const texts = entry.message.content
          .filter(b => b.type === "text" && b.text)
          .map(b => b.text);
        if (texts.length > 0) {
          parts.push({ role: "assistant", content: texts.join("\n") });
        }
      }
    }

    return parts;
  } catch {
    return null;
  }
}

// ─── Stage 1: Haiku extraction ───────────────────────────────────

function extractSignals(lines) {
  // Build conversation text, chunked for Haiku
  const chunks = chunkConversation(lines);
  const allSignals = [];
  let cumulativeCost = 0;
  const HAIKU_BUDGET = 0.04; // Reserve $0.01 for Sonnet from $0.05 total

  for (const chunk of chunks.slice(0, MAX_HAIKU_CALLS)) {
    if (cumulativeCost >= HAIKU_BUDGET) break;
    const { signals, cost } = runHaikuExtraction(chunk);
    cumulativeCost += cost || 0;
    if (signals) allSignals.push(...signals);
  }

  // Deduplicate by quote similarity
  return deduplicateSignals(allSignals);
}

function chunkConversation(lines) {
  const chunks = [];
  let current = [];
  let currentLen = 0;

  for (const line of lines) {
    const text = `[${line.role}]: ${line.content}`;
    const len = text.length;

    if (currentLen + len > CHUNK_CHARS && current.length > 0) {
      chunks.push(current.join("\n\n"));
      current = [];
      currentLen = 0;
    }

    current.push(text);
    currentLen += len;
  }

  if (current.length > 0) {
    chunks.push(current.join("\n\n"));
  }

  return chunks;
}

function runHaikuExtraction(chunk) {
  const prompt = `Extract learning signals from this Claude Code session transcript.

Look for:
FROM USER TURNS:
- Corrections: user tells Claude it did something wrong, or redirects approach
- Confirmations: user validates a non-obvious choice ("yes exactly", "perfect", accepting unusual approach)
- Explicit feedback: "don't do X", "always Y", "I prefer Z"

FROM ASSISTANT TURNS:
- Stated assumptions that were later corrected
- Rejected alternatives that the user brought back
- Caveats that turned out to matter

Signal types (categorical):
- "correction" — user corrected Claude's approach or output
- "approval" — user confirmed a non-obvious approach worked
- "observation" — interesting pattern worth noting but not directly actionable

Skip:
- Routine operations (file reads, test runs, standard coding)
- Generic positive feedback ("thanks", "ok", "looks good" without non-obvious context)
- Tool errors that were just retried successfully

## Transcript
${chunk}

## Output
ONLY a JSON object — no markdown fences, no commentary.
{"signals":[{"type":"correction|approval|observation","quote":"exact short quote from transcript","context":"one-line explanation of what was learned"}],"has_learnings":true}

If nothing worth learning → {"signals":[],"has_learnings":false}`;

  const { output, cost } = callClaude("haiku", prompt);
  if (!output) return { signals: null, cost };

  try {
    const parsed = JSON.parse(output);
    if (!parsed.has_learnings || !Array.isArray(parsed.signals)) return { signals: null, cost };
    return { signals: parsed.signals.filter(s => s.type && s.quote && s.context), cost };
  } catch {
    return { signals: null, cost };
  }
}

// ─── Stage 2: Sonnet reflection ──────────────────────────────────

function generateReflection(signals) {
  // Read existing memory for context
  const memoryContent = readMemoryIndex();

  const signalText = signals.map((s, i) =>
    `${i + 1}. [${s.type}] "${s.quote}" — ${s.context}`
  ).join("\n");

  const prompt = `Generate memory patches and tips from these session signals. Each memory should be a durable fact (preference, pattern, constraint) worth preserving across sessions. Each tip should be an actionable statusline hint (💡 prefix, max 120 chars).

## Signals
${signalText}

## Existing memory (skip anything already covered)
${memoryContent || "(no existing memory found)"}

## Rules
- Skip signals that are too session-specific to generalize or are routine operations
- Memory format: name (kebab-case), description (one-line for index), type (feedback|user|project), content (lead with the rule, then Why: and How to apply: lines)
- Tip format: "💡 " prefix, max 120 chars, actionable for the human operator

## Output
ONLY a JSON object — no markdown fences, no commentary.
{"memories":[{"name":"short-kebab-name","description":"one-line for MEMORY.md index","type":"feedback|user|project","content":"the memory content"}],"tips":["💡 tip text"]}

If nothing worth keeping → {"memories":[],"tips":[]}`;

  const { output } = callClaude("sonnet", prompt);
  if (!output) return null;

  try {
    const parsed = JSON.parse(output);
    return {
      memories: Array.isArray(parsed.memories) ? parsed.memories : [],
      tips: Array.isArray(parsed.tips) ? parsed.tips : [],
    };
  } catch {
    return null;
  }
}

function readMemoryIndex() {
  // Try project-scoped memory first, then global
  const projectMemoryDir = path.join(HOME, ".claude", "projects");
  try {
    // Find the right project memory by matching cwd
    if (cwd) {
      const slug = cwd.replace(/[/\\]+$/, "").replace(/[:\\/]/g, "-");
      const memPath = path.join(projectMemoryDir, slug, "memory", "MEMORY.md");
      if (fs.existsSync(memPath)) {
        return fs.readFileSync(memPath, "utf-8").slice(0, 4000);
      }
    }
  } catch {}

  // Fallback: global memory
  try {
    const globalMem = path.join(HOME, ".claude", "memory", "MEMORY.md");
    if (fs.existsSync(globalMem)) {
      return fs.readFileSync(globalMem, "utf-8").slice(0, 4000);
    }
  } catch {}

  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────

function callClaude(model, prompt) {
  const claudePath = resolveClaudePath();

  const args = [
    "-p",
    "--model", model,
    "--output-format", "json",
    "--max-turns", "1",
    "--tools", "",
    "--no-chrome",
    "--strict-mcp-config",
    "--system-prompt", "",
    "--disable-slash-commands",
    "--no-session-persistence",
  ];

  if (model === "haiku") {
    args.push("--max-budget-usd", "0.01");
  } else {
    args.push("--max-budget-usd", "0.04");
  }

  const result = spawnSync(claudePath, args, {
    input: prompt,
    timeout: 60000,
    encoding: "utf-8",
    windowsHide: true,
  });

  if (result.error || result.status !== 0) return { output: null, cost: 0 };

  try {
    const envelope = JSON.parse((result.stdout || "").trim());
    let output = (envelope.result || "").trim();
    // Strip markdown fences
    output = output.replace(/^\s*```json?\s*/gm, "").replace(/\s*```\s*$/gm, "").trim();
    const cost = envelope.total_cost_usd || 0;
    return { output, cost };
  } catch {
    return { output: (result.stdout || "").trim(), cost: 0 };
  }
}

function resolveClaudePath() {
  const cmd = process.platform === "win32" ? "where" : "which";
  try {
    const result = spawnSync(cmd, ["claude"], {
      encoding: "utf-8",
      timeout: 5000,
      windowsHide: true,
    });
    const firstLine = (result.stdout || "").split("\n")[0].trim();
    if (firstLine) return firstLine;
  } catch {}
  return "claude";
}

function deduplicateSignals(signals) {
  const seen = new Set();
  return signals.filter(s => {
    const key = s.quote.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
