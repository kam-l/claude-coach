#!/usr/bin/env node
"use strict";

const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");

const LOG_PATH = path.join(os.homedir(), ".claude", "plugins", "claude-coach", "enrichment-log.jsonl");

const DIRECTIVES = {
  clarify: `<user-prompt-submit-hook>
BLOCKING REQUIREMENT — The user's prompt above has ambiguous scope. Before you read any files or call any tools, you MUST use AskUserQuestion to ask exactly 1 clarifying question. Do not guess. Do not proceed. Clarify first — wrong assumptions waste the user's context window.
</user-prompt-submit-hook>`,
  plan: `<user-prompt-submit-hook>
BLOCKING REQUIREMENT — The user's prompt above requires multi-file changes. Before any Edit or Write, you MUST use TodoWrite to outline all steps. Do not start coding yet. Planning prevents wasted edits and partial implementations.
</user-prompt-submit-hook>`,
  recon: `<user-prompt-submit-hook>
BLOCKING REQUIREMENT — The user's prompt above references code you haven't examined. Before proposing changes, you MUST use Read and Grep to survey the relevant files. Summarize what you find to the user before editing. Acting on assumptions about unread code produces wrong diffs.
</user-prompt-submit-hook>`,
  challenge: `<user-prompt-submit-hook>
BLOCKING REQUIREMENT — The user's prompt above challenges a previous decision. Before changing any code, you MUST list the assumptions behind the current approach and present them to the user. Reversing without understanding why it was done this way risks reintroducing solved problems.
</user-prompt-submit-hook>`,
  decompose: `<user-prompt-submit-hook>
BLOCKING REQUIREMENT — The user's prompt above contains multiple subtasks. Before starting work, you MUST use TodoWrite to list each subtask separately. Complete them sequentially and confirm each before moving to the next. Parallel execution of ambiguous subtasks compounds errors.
</user-prompt-submit-hook>`,
};

const SYSTEM_PROMPT = `You are a routing classifier for a Claude Code agent. You receive user prompts and select ONE behavioral directive to inject, or NONE if the prompt is clear and actionable.

Respond with ONLY a JSON object: {"directive": "key"} or {"directive": "none"}

Selection criteria:
- "clarify" — Ambiguous scope, multiple interpretations, or missing critical detail.
- "plan" — Changes across multiple files or architecture-level decisions.
- "recon" — References code the user hasn't described.
- "challenge" — Asks to revert, redo, or change a previous decision.
- "decompose" — Contains 3+ distinct subtasks.
- "none" — Clear, single-action. Agent can proceed normally.

Bias toward "none". Only intervene when proceeding without the directive would likely produce a wrong or wasted result.`;

// --- Logging ---

function appendLog(entry) {
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n");
  } catch (_) { /* fail-open */ }

  // Fire-and-forget log rotation
  fs.stat(LOG_PATH, (err, stats) => {
    if (err || !stats || stats.size <= 1_000_000) return;
    try {
      const lines = fs.readFileSync(LOG_PATH, "utf-8").split("\n");
      fs.writeFileSync(LOG_PATH, lines.slice(-500).join("\n"));
    } catch (_) { /* best-effort */ }
  });
}

// --- Local gate ---

function shouldSkip(prompt) {
  const tokens = prompt.trim().split(/\s+/);
  if (tokens.length < 5) return true;
  if (/^[*/#]/.test(prompt.trim())) return true;
  if (/^(y|n|yes|no|ok|done|looks good|lgtm|continue|sure|go ahead|ship it)\b/i.test(prompt.trim())) return true;

  const sentenceBoundaries = prompt.split(/[.!?]\s+[A-Z]/).length;
  const hasQuestion = /\?/.test(prompt);
  const hasHedging = /\b(maybe|not sure|I think|probably|might|could)\b/i.test(prompt);
  const hasBroadScope = /\b(all|everywhere|entire|whole|every)\b/i.test(prompt);
  const hasVagueReferent = /\b(it|that|the thing|this)\b/i.test(prompt);

  if (sentenceBoundaries <= 1 && !hasQuestion && !(hasVagueReferent && hasHedging) && !hasHedging && !hasBroadScope) {
    return true;
  }

  return false;
}

function shouldPass(prompt) {
  if (/\?/.test(prompt)) return true;

  const sentenceBoundaries = prompt.split(/[.!?]\s+[A-Z]/).length;
  if (sentenceBoundaries >= 2) return true;

  const hasHedging = /\b(maybe|not sure|I think|probably|might|could)\b/i.test(prompt);
  if (hasHedging) return true;

  const hasBroadScope = /\b(all|everywhere|entire|whole|every)\b/i.test(prompt);
  if (hasBroadScope) return true;

  const hasVagueReferent = /\b(it|that|the thing|this)\b/i.test(prompt);
  if (hasVagueReferent && hasHedging) return true;

  return false;
}

// --- API backends ---

function buildGroqRequest(apiKey, prompt) {
  return {
    options: {
      hostname: "api.groq.com",
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      max_tokens: 30,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Classify this Claude Code user prompt:\n---\n${prompt}\n---` },
      ],
    }),
    parseResponse(resBody) {
      const c = resBody.choices && resBody.choices[0];
      return (c && c.message && c.message.content) || "";
    },
  };
}

function buildAnthropicRequest(apiKey, prompt) {
  return {
    options: {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 30,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Classify this Claude Code user prompt:\n---\n${prompt}\n---` }],
    }),
    parseResponse(resBody) {
      return (resBody.content && resBody.content[0] && resBody.content[0].text) || "";
    },
  };
}

// --- Main ---

(function main() {
  let raw;
  try {
    raw = fs.readFileSync(0, "utf-8");
  } catch (_) {
    process.exit(0);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    process.exit(0);
  }

  const prompt = data.prompt || "";
  if (!prompt) process.exit(0);

  // Local gate
  if (shouldSkip(prompt)) process.exit(0);
  if (!shouldPass(prompt)) process.exit(0);

  // Pick backend: Groq (primary, free) → Anthropic (fallback, paid)
  const groqKey = process.env.GROQ_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!groqKey && !anthropicKey) {
    appendLog({ ts: new Date().toISOString(), error: "no_api_key" });
    process.exit(0);
  }

  const backend = groqKey ? buildGroqRequest(groqKey, prompt) : buildAnthropicRequest(anthropicKey, prompt);
  const provider = groqKey ? "groq" : "anthropic";
  const startTime = Date.now();

  const req = https.request(backend.options, (res) => {
    let chunks = [];
    res.on("data", (chunk) => chunks.push(chunk));
    res.on("end", () => {
      const latencyMs = Date.now() - startTime;
      try {
        const resBody = JSON.parse(Buffer.concat(chunks).toString());
        const text = backend.parseResponse(resBody);
        const match = text.match(/\{"directive"\s*:\s*"(\w+)"\}/);
        const directive = match ? match[1] : "none";

        appendLog({
          ts: new Date().toISOString(),
          prompt_preview: prompt.slice(0, 80),
          directive,
          provider,
          latency_ms: latencyMs,
        });

        if (directive !== "none" && DIRECTIVES[directive]) {
          process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
              hookEventName: "UserPromptSubmit",
              additionalContext: DIRECTIVES[directive],
            },
          }));
        }
      } catch (_) {
        appendLog({ ts: new Date().toISOString(), error: "parse_error", provider, latency_ms: latencyMs });
      }
      process.exit(0);
    });
  });

  // Wall-clock timeout
  const timer = setTimeout(() => {
    appendLog({ ts: new Date().toISOString(), error: "timeout", provider, latency_ms: Date.now() - startTime });
    req.destroy();
    process.exit(0);
  }, 2500);
  timer.unref();

  req.on("error", () => {
    appendLog({ ts: new Date().toISOString(), error: "request_error", provider, latency_ms: Date.now() - startTime });
    process.exit(0);
  });

  req.write(backend.body);
  req.end();
})();
