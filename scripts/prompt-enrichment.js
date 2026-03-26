#!/usr/bin/env node
"use strict";
/**
 * UserPromptSubmit hook — frustration detection (local regex, zero latency).
 *
 * When frustration is detected, injects additionalContext coaching Claude
 * to pause, diagnose root cause, and course-correct instead of doubling down.
 *
 * No external API calls. No dependencies beyond Node.js.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.CLAUDE_PLUGIN_DATA;
const LOG_PATH = DATA_DIR ? path.join(DATA_DIR, "enrichment-log.jsonl") : null;

const DIRECTIVE = `<coaching>
The user is frustrated — your previous approach failed. Do not continue it. Redo from scratch:
1. State what went wrong in one sentence. No apology, no filler.
2. Re-read the relevant code and constraints. Your prior mental model was incorrect — rebuild it.
3. Design a simpler approach. Fewer moving parts, clearer responsibilities. The first pass taught you the problem — now solve it properly.
4. Implement the new approach. It should be shorter and simpler than what you tried before.
Do not retry the same strategy. Do not ask clarifying questions — the user already told you what's wrong.
</coaching>`;

// --- Frustration detection (local regex, zero latency) ---

function detectFrustration(prompt) {
  // Direct invectives
  if (/\b(wtf|wth|what the (fuck|hell|heck)|ffs|jfc|damn ?it|dammit|for fuck'?s? sake)\b/i.test(prompt)) return true;
  // Blame/confusion directed at Claude
  if (/\b(why did you|why are you|you (broke|ruined|messed|screwed)|stop (doing|changing|breaking)|I (told|said|asked) you)\b/i.test(prompt)) return true;
  // Exasperation / repeated-correction signals
  if (/\b(again\?|still (broken|wrong|not)|not what I (asked|wanted|meant)|this is wrong|that'?s wrong|no no no|undo (that|this|it)|revert (that|this|it))(?=\W|$)/i.test(prompt)) return true;
  return false;
}

// --- Logging ---

function appendLog(entry) {
  if (!LOG_PATH) return;
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n");
  } catch { /* fail-open */ }
}

// --- Main ---

try {
  const raw = fs.readFileSync(0, "utf-8");
  if (!raw) process.exit(0);

  const data = JSON.parse(raw);
  if (data.agent_id) process.exit(0);

  const prompt = data.prompt || "";
  if (!prompt) process.exit(0);

  // Skip slash commands, advisor prompts, task notifications
  if (/^\//.test(prompt.trim())) process.exit(0);
  if (/^Analyze a Claude Code session transcript/i.test(prompt.trim())) process.exit(0);
  if (/^<task-notification>/i.test(prompt.trim())) process.exit(0);

  if (detectFrustration(prompt)) {
    appendLog({ ts: new Date().toISOString(), prompt_preview: prompt.slice(0, 80), directive: "frustration" });
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: DIRECTIVE,
      },
    }));
  }

  process.exit(0);
} catch {
  process.exit(0); // fail-open
}
