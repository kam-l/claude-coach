#!/usr/bin/env node
/**
 * Stop hook — spawns detached reflection pipeline.
 *
 * Fast and sync: reads stdin, validates, spawns child, exits.
 * Fail-open: errors never block session teardown.
 *
 * Dedup: skips subagent Stop events via agent_id field (present on subagents,
 * absent on main session). Falls back to transcript size check.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const DATA_DIR = process.env.CLAUDE_PLUGIN_DATA;
if (!DATA_DIR) process.exit(0);

const MIN_TRANSCRIPT_BYTES = 10000; // Skip tiny transcripts (subagents, aborted sessions)
const LOCK_FILE = path.join(DATA_DIR, "reflect.lock");

try {
  const raw = fs.readFileSync(0, "utf-8");
  if (!raw || raw.trim() === "") process.exit(0);

  const data = JSON.parse(raw);

  // Must be a Stop event with transcript
  if (data.hook_event_name !== "Stop") process.exit(0);
  if (!data.transcript_path) process.exit(0);

  // Dedup: skip subagent Stops (agent_id present = subagent)
  if (data.agent_id) process.exit(0);

  // Dedup: skip trivial sessions (too small to learn from)
  try {
    const stat = fs.statSync(data.transcript_path);
    if (stat.size < MIN_TRANSCRIPT_BYTES) process.exit(0);
  } catch {
    process.exit(0); // transcript missing
  }

  // Dedup: skip if another reflection is already running
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockContent = fs.readFileSync(LOCK_FILE, "utf-8");
      const lockTs = parseInt(lockContent.split("\n")[1], 10);
      if (Date.now() - lockTs < 120000) process.exit(0); // within 2 min
    }
  } catch {}

  // Spawn detached pipeline
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const pipelineScript = path.join(__dirname, "reflect-pipeline.js");
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

  process.exit(0);
} catch {
  process.exit(0);
}
