#!/usr/bin/env node
"use strict";

const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");

const LOG_PATH = path.join(os.homedir(), ".claude", "plugins", "claude-coach", "enrichment-log.jsonl");

// --- Directive payloads (injected as additionalContext) ---
// 4 directives: clarify > probe > recon > plan (priority order, highest wins)
// Routes to plugin commands (/claude-coach:*) and built-in tools (Agent, EnterPlanMode)

const DIRECTIVES = {
  clarify: `<pre-task-instruction>
The user's prompt has ambiguous scope or missing critical detail. Use the Skill tool to invoke /claude-coach:question with the ambiguous points as arguments.
Exception: if the conversation context already makes the intent clear, proceed normally.
</pre-task-instruction>`,
  probe: `<pre-task-instruction>
The user's prompt contains unstated assumptions, asks for an opinion, or requests open-ended research. Use the Skill tool to invoke /claude-coach:verify with the claim or design question as the argument.
Exception: if the user explicitly asks you to just pick, proceed with your best judgment.
</pre-task-instruction>`,
  recon: `<pre-task-instruction>
The user's prompt references code you may not have examined in this conversation. Use the Agent tool with subagent_type "Explore" to survey the relevant files and summarize findings before proposing changes.
Exception: if you have Read tool results for the specific files mentioned in this prompt, proceed normally.
</pre-task-instruction>`,
  plan: `<pre-task-instruction>
The user's prompt involves multiple files, subtasks, or architectural changes. Use the EnterPlanMode tool to outline all steps before any Edit or Write. If the prompt contains distinct subtasks, list them separately and complete sequentially.
Exception: if you have already surveyed the scope and it is a single focused change, proceed normally.
</pre-task-instruction>`,
};

// --- Classifier system prompt ---
// Calibrated for llama-3.1-8b-instant on pre-filtered prompts
// (the local gate already removed trivially clear prompts)

const SYSTEM_PROMPT = `You are a routing classifier for a Claude Code agent. The user's prompt has already been pre-screened and passed because it contains complexity signals (hedging, questions, multiple sentences, or broad scope). Your job is to select the best behavioral directive, or none if the prompt is clear despite its surface complexity.

Your entire response must be exactly one JSON object and nothing else.
Valid format: {"directive": "key"} or {"directive": "none"}
Do not include any explanation, preamble, markdown formatting, or text outside the JSON.

Selection criteria (in priority order — when multiple apply, pick the highest):
1. "plan" — Requires changes across multiple files, contains 3+ subtasks, or involves architecture-level decisions.
2. "recon" — References code, files, or systems the agent hasn't examined.
3. "clarify" — Ambiguous scope, multiple interpretations, or missing critical detail that would cause a wrong result.
4. "probe" — Contains unstated assumptions, asks for an opinion or recommendation, or requests open-ended research/comparison.
5. "none" — Clear and actionable despite complexity signals. The agent can proceed normally.

Select "none" when the prompt has a clear single action, even if phrased as a question or with hedging.`;

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
  if (/^\//.test(prompt.trim())) return true;
  if (/^Analyze a Claude Code session transcript/i.test(prompt.trim())) return true;
  if (/^<task-notification>/i.test(prompt.trim())) return true;
  if (/^(y|n|yes|no|ok|done|looks good|lgtm|continue|sure|go ahead|ship it)\b/i.test(prompt.trim())) return true;

  const sentenceBoundaries = prompt.split(/[.!?]\s+[A-Z]/).length;
  const hasQuestion = /\?/.test(prompt);
  const hasHedging = /\b(maybe|not sure|I think|probably|might)\b/i.test(prompt);
  const hasBroadScope = /\b(all|everywhere|entire|whole|every)\b/i.test(prompt);
  if (sentenceBoundaries <= 1 && !hasQuestion && !hasHedging && !hasBroadScope) {
    return true;
  }

  return false;
}

function shouldPass(prompt) {
  if (/\?/.test(prompt)) return true;

  const sentenceBoundaries = prompt.split(/[.!?]\s+[A-Z]/).length;
  if (sentenceBoundaries >= 2) return true;

  const hasHedging = /\b(maybe|not sure|I think|probably|might)\b/i.test(prompt);
  if (hasHedging) return true;

  const hasBroadScope = /\b(all|everywhere|entire|whole|every)\b/i.test(prompt);
  if (hasBroadScope) return true;

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

  // Skip subagents — only enrich main conversation
  if (data.agent_id) process.exit(0);

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
