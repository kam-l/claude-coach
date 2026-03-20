#!/usr/bin/env node
/**
 * Claude Code statusline script for claude-coach plugin.
 * Reads session data from stdin, outputs a contextual tip.
 *
 * Install location: ~/.claude/plugins/claude-coach/statusline-tips.js
 * Registered in settings.json as: {"type": "command", "command": "node {HOME}/.claude/.tips/statusline-tips.js"}
 */

const path = require("path");
const os = require("os");

const TIPS_DIR = path.join(os.homedir(), ".claude", "plugins", "claude-coach");

let advisor;
try {
  advisor = require(path.join(TIPS_DIR, "session-advisor"));
} catch {
  process.stdout.write("");
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
    process.stdout.write("");
  }
});
