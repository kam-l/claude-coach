#!/usr/bin/env node
/**
 * SessionEnd hook — spawns detached reflection pipeline.
 *
 * Fast and sync: reads stdin, validates, spawns child, exits.
 * Fail-open: errors never block session teardown.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const DATA_DIR = process.env.CLAUDE_PLUGIN_DATA;
if (!DATA_DIR) process.exit(0);

const MIN_TRANSCRIPT_BYTES = 10000; // Skip tiny transcripts (subagents, aborted sessions)
const LOCK_FILE = path.join(DATA_DIR, "reflect.lock");
const DEBUG = process.env.CLAUDE_COACH_DEBUG === "1";

function log(msg) {
  if (!DEBUG) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(path.join(DATA_DIR, "reflect-debug.log"),
      `${new Date().toISOString()} [hook] ${msg}\n`);
  } catch {}
}

try {
  const raw = fs.readFileSync(0, "utf-8");
  if (!raw || raw.trim() === "") { log("exit: empty stdin"); process.exit(0); }

  const data = JSON.parse(raw);
  log(`event=${data.hook_event_name} agent_id=${data.agent_id || "none"} transcript=${data.transcript_path || "none"}`);

  // Must be a SessionEnd event with transcript
  if (data.hook_event_name !== "SessionEnd") { log("exit: not SessionEnd"); process.exit(0); }
  if (!data.transcript_path) { log("exit: no transcript_path"); process.exit(0); }

  // Dedup: skip trivial sessions (too small to learn from)
  try {
    const stat = fs.statSync(data.transcript_path);
    log(`transcript_size=${stat.size}`);
    if (stat.size < MIN_TRANSCRIPT_BYTES) { log("exit: too small"); process.exit(0); }
  } catch (e) {
    log(`exit: transcript missing (${e.message})`); process.exit(0);
  }

  // Dedup: skip if another reflection is already running
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockContent = fs.readFileSync(LOCK_FILE, "utf-8");
      const lockTs = parseInt(lockContent.split("\n")[1], 10);
      if (Date.now() - lockTs < 120000) { log("exit: lock active"); process.exit(0); }
    }
  } catch {}

  // Spawn detached pipeline
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const pipelineScript = path.join(__dirname, "reflect-pipeline.js");
  log(`spawning: ${pipelineScript}`);
  const child = spawn(process.execPath, [
    pipelineScript,
    data.transcript_path,
    data.session_id,
    data.cwd || "",
  ], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, CLAUDE_PLUGIN_DATA: DATA_DIR },
  });
  child.unref();
  log(`spawned pid=${child.pid}`);

  process.exit(0);
} catch (e) {
  log(`error: ${e.message}`);
  process.exit(0);
}
