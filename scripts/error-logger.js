#!/usr/bin/env node
/**
 * PostToolUseFailure + StopFailure hook — logs errors for advisor analysis.
 *
 * PostToolUseFailure: logs tool failure, injects coaching context on repeated failures.
 * StopFailure: logs API error (output ignored by Claude Code).
 *
 * Errors written to: ${CLAUDE_PLUGIN_DATA}/errors.jsonl
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.CLAUDE_PLUGIN_DATA;
if (!DATA_DIR) process.exit(0);

const LOG_PATH = path.join(DATA_DIR, "errors.jsonl");
const REPEAT_THRESHOLD = 3; // inject advice after N failures of same tool in same session

try {
  const input = fs.readFileSync(0, "utf-8");
  if (!input || input.trim() === "") process.exit(0);

  const data = JSON.parse(input);
  const event = data.hook_event_name;

  // Build log entry
  const entry = {
    ts: new Date().toISOString(),
    session: data.session_id,
    event,
  };

  if (event === "PostToolUseFailure") {
    entry.tool = data.tool_name;
    entry.error = (data.error || "").slice(0, 500);
    entry.input = typeof data.tool_input === "object"
      ? JSON.stringify(data.tool_input).slice(0, 200)
      : undefined;
  } else if (event === "StopFailure") {
    entry.error = (data.error || "").slice(0, 500);
    entry.details = (data.error_details || "").slice(0, 200);
  }

  // Append to log (create dir if needed)
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n");
  } catch { /* fail-open */ }

  // For PostToolUseFailure: inject advice on repeated failures
  if (event === "PostToolUseFailure" && data.tool_name && data.session_id) {
    const count = countRecentFailures(data.session_id, data.tool_name);
    if (count >= REPEAT_THRESHOLD) {
      const advice = buildAdvice(data.tool_name, count, data.error);
      if (advice) {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PostToolUseFailure",
            additionalContext: `[Session Coach]\n${advice}`,
          },
        }));
      }
    }
  }

  process.exit(0);
} catch {
  process.exit(0); // fail-open
}

// --- Helpers ---

function countRecentFailures(sessionId, toolName) {
  try {
    const lines = fs.readFileSync(LOG_PATH, "utf-8").split("\n").filter(Boolean);
    let count = 0;
    // Count recent failures for this session+tool (last 50 lines max)
    const recent = lines.slice(-50);
    for (const line of recent) {
      try {
        const e = JSON.parse(line);
        if (e.session === sessionId && e.tool === toolName && e.event === "PostToolUseFailure") {
          count++;
        }
      } catch { /* skip malformed */ }
    }
    return count;
  } catch {
    return 0;
  }
}

function buildAdvice(toolName, count, error) {
  const err = (error || "").toLowerCase();

  if (toolName === "Bash" && err.includes("non-zero")) {
    return `\u26a0\ufe0f ${toolName} has failed ${count} times this session. Read the error output carefully before retrying — consider a different approach.`;
  }
  if (toolName === "Edit" && (err.includes("not unique") || err.includes("not found"))) {
    return `\u26a0\ufe0f ${toolName} has failed ${count} times. Re-read the file to get exact content before editing.`;
  }
  if (toolName === "Write" || toolName === "Edit") {
    return `\u26a0\ufe0f ${toolName} has failed ${count} times this session. Stop and verify your assumptions before the next attempt.`;
  }
  return `\u26a0\ufe0f ${toolName} has failed ${count} times this session. Consider a different approach rather than retrying the same pattern.`;
}
