#!/usr/bin/env node
"use strict";

/**
 * A/B test: prompt enrichment directives vs raw prompts
 * Chain: Groq classifier → directive → claude -p --model sonnet
 *
 * For each test case:
 *   A (control): claude -p with raw prompt only
 *   B (enriched): claude -p with directive + prompt
 * Then check behavioral markers in each response.
 */

const { execSync } = require("child_process");
const https = require("https");

// --- Test cases (subset of eval-cases, only gate-passing prompts) ---

const TEST_CASES = [
  {
    name: "clarify",
    prompt: "What's the best approach for handling file uploads? I'm not sure if we should stream or buffer.",
    markers: [/\?/m, /what|which|how|clarif|question|detail|constraint|requirement/i],
    markerDesc: "asks questions back / requests details",
  },
  {
    name: "frustration",
    prompt: "wtf why did you delete my test file, I told you not to touch tests",
    markers: [/verif|check|confirm|assumption|understand|apologi|sorry|misunderstand|let me.*review/i],
    markerDesc: "acknowledges frustration / verifies assumptions",
    fastPath: true, // regex fast-path, skip Groq
  },
  {
    name: "plan",
    prompt: "Update the database schema to add a new user_roles table, migrate existing role data from the users table, and update all API endpoints to use the new table.",
    markers: [/step|plan|first.*then|1\.|phase|outline|sequen/i],
    markerDesc: "outlines steps / structured plan",
  },
  {
    name: "recon",
    prompt: "Trace how the caching layer in src/cache connects to the API routes and summarize the dependency chain. I think there might be a circular dependency.",
    markers: [/read|examin|explor|look|survey|inspect|investigat|trace/i],
    markerDesc: "mentions exploring/reading code first",
  },
];

// --- Directives (must match prompt-enrichment.js) ---

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

// --- Groq classifier ---

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

function classifyWithGroq(prompt) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return reject(new Error("GROQ_API_KEY not set"));

    const body = JSON.stringify({
      model: "llama-3.1-8b-instant",
      max_tokens: 30,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Classify this Claude Code user prompt:\n---\n${prompt}\n---` },
      ],
    });

    const req = https.request({
      hostname: "api.groq.com",
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
    }, (res) => {
      let chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          const text = body.choices?.[0]?.message?.content || "";
          const match = text.match(/\{"directive"\s*:\s*"(\w+)"\}/);
          resolve(match ? match[1] : "none");
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// --- Claude -p runner ---

function callClaude(prompt, maxTokens = 300) {
  try {
    // Escape for shell: use temp file approach to avoid quote issues
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const tmpFile = path.join(os.tmpdir(), `ab-test-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
    fs.writeFileSync(tmpFile, prompt);
    const result = execSync(
      `claude -p --model sonnet --max-turns 1 < "${tmpFile}"`,
      { encoding: "utf-8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] }
    );
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    return result.trim();
  } catch (e) {
    return `[ERROR: ${e.message}]`;
  }
}

// --- Scoring ---

function scoreResponse(response, markers) {
  let hits = 0;
  for (const marker of markers) {
    if (marker.test(response)) hits++;
  }
  return hits;
}

// --- Main ---

async function main() {
  console.log("=== Prompt Enrichment A/B Test ===\n");
  console.log(`Test cases: ${TEST_CASES.length}`);
  console.log(`Each case: A (raw) vs B (enriched) via claude -p --model sonnet\n`);

  const results = [];

  for (const tc of TEST_CASES) {
    console.log(`--- [${tc.name.toUpperCase()}] ---`);
    console.log(`Prompt: "${tc.prompt.slice(0, 70)}..."`);

    // Step 1: Classify
    let directive;
    if (tc.fastPath) {
      directive = tc.name;
      console.log(`Classifier: skipped (local fast-path → ${directive})`);
    } else {
      directive = await classifyWithGroq(tc.prompt);
      console.log(`Classifier: Groq → "${directive}" (expected: "${tc.name}")`);
    }

    const classifierMatch = directive === tc.name;

    // Step 2A: Control (raw prompt)
    console.log("Running A (control)...");
    const rawPrompt = `You are Claude Code, a coding assistant. The user says:\n\n${tc.prompt}\n\nRespond concisely (under 200 words). You have no access to files or tools — just describe what you would do.`;
    const responseA = callClaude(rawPrompt);

    // Step 2B: Enriched (directive + prompt)
    console.log("Running B (enriched)...");
    const enrichedDirective = DIRECTIVES[directive] || DIRECTIVES[tc.name];
    const enrichedPrompt = `You are Claude Code, a coding assistant.\n\n${enrichedDirective}\n\nThe user says:\n\n${tc.prompt}\n\nRespond concisely (under 200 words). You have no access to files or tools — just describe what you would do. Follow the required_action above.`;
    const responseB = callClaude(enrichedPrompt);

    // Step 3: Score
    const scoreA = scoreResponse(responseA, tc.markers);
    const scoreB = scoreResponse(responseB, tc.markers);
    const improved = scoreB > scoreA;
    const delta = scoreB - scoreA;

    results.push({
      name: tc.name,
      classifierMatch,
      directive,
      scoreA,
      scoreB,
      delta,
      improved,
      responseA: responseA.slice(0, 200),
      responseB: responseB.slice(0, 200),
    });

    console.log(`Markers (${tc.markerDesc}):`);
    console.log(`  A (raw):      ${scoreA}/${tc.markers.length} markers hit`);
    console.log(`  B (enriched): ${scoreB}/${tc.markers.length} markers hit`);
    console.log(`  Delta: ${delta >= 0 ? "+" : ""}${delta} ${improved ? "✓ IMPROVED" : delta === 0 ? "= SAME" : "✗ REGRESSED"}`);
    console.log();
  }

  // Summary
  console.log("\n=== SUMMARY ===\n");
  console.log("Case         | Classifier | A score | B score | Delta | Result");
  console.log("-------------|------------|---------|---------|-------|-------");
  for (const r of results) {
    const cls = r.classifierMatch ? "✓ match" : `✗ got ${r.directive}`;
    const delta = `${r.delta >= 0 ? "+" : ""}${r.delta}`;
    const result = r.improved ? "IMPROVED" : r.delta === 0 ? "SAME" : "REGRESSED";
    console.log(
      `${r.name.padEnd(12)} | ${cls.padEnd(10)} | ${String(r.scoreA).padEnd(7)} | ${String(r.scoreB).padEnd(7)} | ${delta.padEnd(5)} | ${result}`
    );
  }

  // Response samples
  console.log("\n=== RESPONSE SAMPLES ===\n");
  for (const r of results) {
    console.log(`--- [${r.name.toUpperCase()}] A (raw) ---`);
    console.log(r.responseA);
    console.log(`\n--- [${r.name.toUpperCase()}] B (enriched) ---`);
    console.log(r.responseB);
    console.log();
  }

  const improved = results.filter(r => r.improved).length;
  const same = results.filter(r => r.delta === 0).length;
  const regressed = results.filter(r => r.delta < 0).length;
  console.log(`\nOverall: ${improved} improved, ${same} same, ${regressed} regressed out of ${results.length} cases`);

  process.exit(regressed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
