#!/usr/bin/env node
/**
 * UserPromptSubmit hook — injects strong coaching advice into Claude's context.
 *
 * Reads advisor cache. If strength is "inject", outputs additionalContext
 * via JSON on stdout (exit 0), then DELETES the cache file so the same
 * advice is never injected twice.
 *
 * If no strong advice exists, outputs nothing (silent pass-through).
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const CACHE_DIR = path.join(os.homedir(), ".claude", "plugins", "claude-coach", "cache");

try {
  const input = fs.readFileSync(0, "utf-8");
  const data = JSON.parse(input);
  if (data.agent_id) process.exit(0); // skip subagents
  const sessionId = data.session_id;
  if (!sessionId) process.exit(0);

  // Read advisor cache
  const cacheFile = path.join(CACHE_DIR, `advice-${sessionId}.json`);
  let cache;
  try {
    cache = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
  } catch {
    process.exit(0); // no cache — silent pass-through
  }

  // Only inject if strength is "inject"
  if (cache.strength !== "inject" || !cache.tips || cache.tips.length === 0) {
    process.exit(0);
  }

  // Build coaching context — ⚠️ prefix signals injected advice
  const tips = cache.tips
    .map(t => t.replace(/^💡/, "⚠️"))
    .join("\n");

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: `[Session Coach]\n${tips}`,
    },
  }));

  // Delete cache — advice consumed, no repeats
  try { fs.unlinkSync(cacheFile); } catch {}

  process.exit(0);
} catch {
  // Fail-open: never block the user's prompt
  process.exit(0);
}
