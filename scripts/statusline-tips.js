#!/usr/bin/env node
/**
 * Claude Code statusline script for claude-coach plugin.
 * Reads session data from stdin, outputs a contextual tip.
 *
 * Install location: ${CLAUDE_PLUGIN_ROOT}/scripts/statusline-tips.js
 * Registered in settings.json as: {"type": "command", "command": "node {HOME}/.claude/.tips/statusline-tips.js"}
 */

const debug = process.env.CLAUDE_COACH_DEBUG === "1";

let advisor;
try {
  advisor = require("./session-advisor");
} catch (e) {
  if (debug) {
    process.stdout.write(`🐞 advisor load failed: ${e.message}`);
  }
  process.exit(0);
}

let input = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input);
    const result = advisor.getSessionAdvice({ sessionId: data.session_id, cwd: data.cwd });
    if (debug && (!result || result.trim() === "")) {
      process.stdout.write("🐞 advisor returned empty");
      return;
    }
    process.stdout.write(result);
  } catch (e) {
    if (debug) {
      process.stdout.write(`🐞 ${e.message}`);
      return;
    }
    // Fallback: show a random tip even if stdin parse failed
    try {
      process.stdout.write(advisor.getSessionAdvice());
    } catch {
      // silent
    }
  }
});
