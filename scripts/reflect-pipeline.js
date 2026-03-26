#!/usr/bin/env node
/**
 * Reflection pipeline — runs as detached child after session ends.
 *
 * Single Sonnet call: extract signals + generate reflections in one pass.
 *   Input: user+assistant conversation lines + existing MEMORY.md
 *   Output: { memories, tips, claude_md_patches, skill_patches }
 *
 * Result: Appended to ~/.claude/projects/{slug}/pending-reflections.jsonl
 *
 * Cost ceiling: ~$0.05/session (single claude -p call, capped via --max-budget-usd).
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
const HOME = os.homedir();

const DEBUG = process.env.CLAUDE_COACH_DEBUG === "1";

function log(msg) {
  if (!DEBUG) return;
  try {
    fs.appendFileSync(path.join(DATA_DIR, "reflect-debug.log"),
      `${new Date().toISOString()} [pipeline] ${msg}\n`);
  } catch {}
}

// ─── Main ────────────────────────────────────────────────────────

const [,, transcriptPath, sessionId, cwd] = process.argv;
if (!transcriptPath || !sessionId) process.exit(0);
log(`start: transcript=${transcriptPath} session=${sessionId} cwd=${cwd}`);

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
  log(`transcript lines=${lines ? lines.length : 0}`);
  if (!lines || lines.length < 20) { log("exit: too few lines"); return; }

  // Single Sonnet call: extract + reflect
  log("sonnet: extract + reflect");
  const result = extractAndReflect(lines);
  log(`result: memories=${result?.memories?.length || 0} tips=${result?.tips?.length || 0} claude_md=${result?.claude_md_patches?.length || 0} skills=${result?.skill_patches?.length || 0} signals=${result?.signals?.length || 0}`);
  const hasReflections = result && (result.memories.length + result.tips.length + result.claude_md_patches.length + result.skill_patches.length > 0);
  if (!hasReflections) {
    log("exit: no reflections");
    return;
  }

  // Append pending reflection to project JSONL
  const slug = (cwd || "global").replace(/[/\\]+$/, "").replace(/[:\\/]/g, "-");
  const projectDir = path.join(HOME, ".claude", "projects", slug);
  fs.mkdirSync(projectDir, { recursive: true });
  const pendingFile = path.join(projectDir, "pending-reflections.jsonl");
  const ts = Date.now();
  const pending = {
    timestamp: ts,
    session_id: sessionId,
    cwd: cwd || null,
    signals: result.signals,
    reflection: {
      memories: result.memories,
      tips: result.tips,
      claude_md_patches: result.claude_md_patches,
      skill_patches: result.skill_patches,
    },
  };
  fs.appendFileSync(pendingFile, JSON.stringify(pending) + "\n");
  log(`appended to: ${pendingFile}`);
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

// ─── Single-pass extraction + reflection ─────────────────────────

function extractAndReflect(lines) {
  // Build conversation text, truncated to fit budget
  const maxChars = 48000; // ~12k tokens, leaves room for prompt + response
  let text = "";
  for (const line of lines) {
    const entry = `[${line.role}]: ${line.content}\n\n`;
    if (text.length + entry.length > maxChars) break;
    text += entry;
  }

  const memoryContent = readMemoryIndex();
  const claudeMdContent = readClaudeMd();

  const prompt = `Analyze this Claude Code session transcript. Extract learning signals and generate reflections in one pass.

## Step 1: Find signals

FROM USER TURNS:
- Corrections: user tells Claude it did something wrong, or redirects approach
- Confirmations: user validates a non-obvious choice ("yes exactly", "perfect", accepting unusual approach)
- Explicit feedback: "don't do X", "always Y", "I prefer Z"

FROM ASSISTANT TURNS:
- Stated assumptions that were later corrected
- Rejected alternatives that the user brought back

Skip routine operations, generic positive feedback, tool errors that were just retried.

## Step 2: Generate reflections from signals found

Route each learning to the right target:
- **Memory**: durable fact (preference, pattern, constraint) worth preserving across sessions. Format: name (kebab-case), description (one-line), type (feedback|user|project), content (lead with rule, then Why: and How to apply:)
- **Tip**: actionable statusline hint. Format: "💡 " prefix, max 120 chars
- **CLAUDE.md patch**: new invariant, convention, or key fact that should be in CLAUDE.md. Only propose if it would prevent a repeated mistake or captures a non-obvious architectural decision. Format: section (which ## heading it belongs under), content (the line(s) to add)
- **Skill patch**: new workflow step, anti-pattern, or trigger phrase for an existing skill. Format: skill_name, section, content

Skip signals too session-specific to generalize. Skip anything already covered below.

## Existing CLAUDE.md (skip duplicates)
${claudeMdContent || "(no CLAUDE.md found)"}

## Existing memory (skip duplicates)
${memoryContent || "(no existing memory found)"}

## Transcript
${text}

## Output
ONLY a JSON object — no markdown fences, no commentary.
{"signals":[{"type":"correction|approval|observation","quote":"exact short quote","context":"what was learned"}],"memories":[{"name":"kebab-name","description":"one-line","type":"feedback|user|project","content":"the content"}],"tips":["💡 tip text"],"claude_md_patches":[{"section":"## Section Name","content":"- the line to add"}],"skill_patches":[{"skill_name":"skill-name","section":"## Section","content":"the content to add"}]}

If nothing worth learning → {"signals":[],"memories":[],"tips":[],"claude_md_patches":[],"skill_patches":[]}`;

  const { output } = callClaude("sonnet", prompt);
  if (!output) return null;

  try {
    const parsed = JSON.parse(output);
    return {
      signals: Array.isArray(parsed.signals) ? parsed.signals : [],
      memories: Array.isArray(parsed.memories) ? parsed.memories : [],
      tips: Array.isArray(parsed.tips) ? parsed.tips : [],
      claude_md_patches: Array.isArray(parsed.claude_md_patches) ? parsed.claude_md_patches : [],
      skill_patches: Array.isArray(parsed.skill_patches) ? parsed.skill_patches : [],
    };
  } catch {
    return null;
  }
}

function readMemoryIndex() {
  // Try project-scoped memory first, then global
  const projectMemoryDir = path.join(HOME, ".claude", "projects");
  try {
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

function readClaudeMd() {
  if (!cwd) return null;
  try {
    const claudeMdPath = path.join(cwd, "CLAUDE.md");
    if (fs.existsSync(claudeMdPath)) {
      return fs.readFileSync(claudeMdPath, "utf-8").slice(0, 4000);
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
    "--max-budget-usd", "0.05",
  ];

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
