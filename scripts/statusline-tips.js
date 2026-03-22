#!/usr/bin/env node
/**
 * Claude Code statusline script for claude-coach plugin.
 * Reads session data from stdin, outputs a contextual tip.
 *
 * Install location: ${CLAUDE_PLUGIN_ROOT}/scripts/statusline-tips.js
 * Registered in settings.json as: {"type": "command", "command": "node {HOME}/.claude/.tips/statusline-tips.js"}
 */

let advisor;
try {
  advisor = require("./session-advisor");
} catch {
  // Can't load advisor — exit silently (Claude Code shows "..." for empty output)
  process.exit(0);
}

let input = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input);
    process.stdout.write(advisor.getSessionAdvice({ sessionId: data.session_id, cwd: data.cwd }));
  } catch {
    // Fallback: show a random tip even if stdin parse failed
    process.stdout.write(advisor.getSessionAdvice());
  }
});
