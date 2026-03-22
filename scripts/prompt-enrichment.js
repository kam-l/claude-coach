#!/usr/bin/env node
"use strict";

const fs = require("fs");
const https = require("https");
const path = require("path");

const LOG_PATH = path.join(process.env.CLAUDE_PLUGIN_DATA, "enrichment-log.jsonl");

// --- Directive payloads (injected as additionalContext) ---
// 4 directives: clarify > frustration > plan > recon (priority order, highest wins)
// The 80% trio (clarify, frustration, plan) have NO exception clauses — they MUST fire.
// Routes to plugin commands (/claude-coach:*) and built-in tools (Agent, EnterPlanMode)

const DIRECTIVES = {
  clarify: `<required_action>
The user's prompt has ambiguous scope or missing critical detail. You MUST use the Skill tool to invoke /claude-coach:question with the ambiguous points as arguments BEFORE doing anything else. Do not proceed without clarifying first.
</required_action>`,
  frustration: `<required_action>
The user's prompt signals frustration, confusion, or disagreement with prior actions. You MUST use the Skill tool to invoke /claude-coach:verify with the current discussion subject as the argument. Do not continue the previous approach — stop and verify your assumptions first.
</required_action>`,
  plan: `<required_action>
The user's prompt involves 2+ files, 2+ logical steps, or any architectural decision. You MUST use the EnterPlanMode tool to outline all steps before any Edit or Write. List each subtask separately and complete sequentially.
</required_action>`,
  recon: `<required_action>
The user's prompt references code you may not have examined in this conversation. Use the Agent tool with subagent_type "Explore" to survey the relevant files and summarize findings before proposing changes.
Exception: if you have Read tool results for the specific files mentioned in this prompt, proceed normally.
</required_action>`,
};

// --- Classifier system prompt ---
// Calibrated for llama-3.1-8b-instant on pre-filtered prompts
// (the local gate already removed trivially clear prompts)

const SYSTEM_PROMPT = `You are a routing classifier for a Claude Code agent. The user's prompt has already been pre-screened and passed because it contains complexity signals. Your job is to select the best behavioral directive. Prefer selecting a directive over "none" — when in doubt, select one.

Your entire response must be exactly one JSON object and nothing else.
Valid format: {"directive": "key"} or {"directive": "none"}
Do not include any explanation, preamble, markdown formatting, or text outside the JSON.

Selection criteria (in priority order — when multiple apply, pick the highest):
1. "clarify" — Ambiguous scope, multiple interpretations, missing critical detail, or the user asks a broad question without specifying constraints.
2. "frustration" — User shows frustration, confusion, blame, or disagreement (invectives, "why did you", "this is wrong", "not what I asked", exasperation, repeated corrections).
3. "plan" — Involves 2+ files, 2+ logical steps, any refactoring, or architectural decisions. Even medium-complexity tasks qualify.
4. "recon" — References code, files, or systems the agent hasn't examined.
5. "none" — ONLY when the prompt is unambiguously a single focused change to one file with no missing information and no frustration signals.

Bias toward action: select a directive unless the prompt is trivially clear.`;

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

// --- Frustration fast-path (local regex, zero latency) ---

function detectFrustration(prompt) {
  // Direct invectives
  if (/\b(wtf|wth|what the (fuck|hell|heck)|ffs|jfc|damn ?it|dammit|for fuck'?s? sake)\b/i.test(prompt)) return true;
  // Blame/confusion directed at Claude
  if (/\b(why did you|why are you|you (broke|ruined|messed|screwed)|stop (doing|changing|breaking)|I (told|said|asked) you)\b/i.test(prompt)) return true;
  // Exasperation / repeated-correction signals
  if (/\b(again\?|still (broken|wrong|not)|not what I (asked|wanted|meant)|this is wrong|that'?s wrong|no no no|undo (that|this|it)|revert (that|this|it))(?=\W|$)/i.test(prompt)) return true;
  return false;
}

// --- Local gate ---

function shouldSkip(prompt) {
  const tokens = prompt.trim().split(/\s+/);
  if (tokens.length < 5) return true;
  // Slash commands, advisor prompts, task notifications already handled before frustration fast-path
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

  // Always skip advisor prompts and slash commands
  if (/^\//.test(prompt.trim())) process.exit(0);
  if (/^Analyze a Claude Code session transcript/i.test(prompt.trim())) process.exit(0);
  if (/^<task-notification>/i.test(prompt.trim())) process.exit(0);

  // Frustration fast-path: bypass all gates, inject immediately
  if (detectFrustration(prompt)) {
    appendLog({ ts: new Date().toISOString(), prompt_preview: prompt.slice(0, 80), directive: "frustration", provider: "local" });
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: DIRECTIVES.frustration,
      },
    }));
    process.exit(0);
  }

  // Normal local gate (non-frustration prompts)
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
