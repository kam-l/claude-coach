#!/usr/bin/env node
/**
 * Merges distilled tips into tips.json and tips_candidates.md.
 * Reads JSON array from stdin: [{ "tip": "...", "strength": "strong"|"weak", "category": "..." }]
 *
 * Usage: node merge-tips.js < distilled.json
 */

const fs = require("fs");
const path = require("path");

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, "..");
const tipsFile = path.join(pluginRoot, "tips.json");
const candidatesFile = path.join(pluginRoot, "tips_candidates.md");

// Read stdin
let input = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  let items;
  try {
    // Handle both raw JSON array and markdown-wrapped ```json blocks
    const cleaned = input.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    items = JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse stdin as JSON:", e.message);
    console.error("Expected: [{ tip, strength, category }]");
    process.exit(1);
  }

  if (!Array.isArray(items)) {
    console.error("Expected JSON array, got:", typeof items);
    process.exit(1);
  }

  // Load existing tips
  let tipsDb = { version: "2.0.0", categories: {} };
  try {
    tipsDb = JSON.parse(fs.readFileSync(tipsFile, "utf-8"));
  } catch { /* start fresh */ }

  // Build dedup set from all existing tips (40-char lowercase prefix)
  const allExisting = Object.values(tipsDb.categories).flat();
  const existingSet = new Set(allExisting.map(t => t.toLowerCase().slice(0, 40)));

  const strong = [];
  const weak = [];

  for (const item of items) {
    if (!item.tip) continue;

    // Ensure 💡 prefix
    const tip = item.tip.startsWith("💡") ? item.tip : `💡 ${item.tip}`;

    // Dedup check
    if (existingSet.has(tip.toLowerCase().slice(0, 40))) continue;

    if (item.strength === "strong") {
      strong.push({ tip, category: item.category || "custom" });
      existingSet.add(tip.toLowerCase().slice(0, 40)); // prevent intra-batch dupes
    } else {
      weak.push({ tip, category: item.category || "custom" });
    }
  }

  // Append strong tips to tips.json
  for (const { tip, category } of strong) {
    if (!tipsDb.categories[category]) tipsDb.categories[category] = [];
    tipsDb.categories[category].push(tip);
  }

  fs.writeFileSync(tipsFile, JSON.stringify(tipsDb, null, 2) + "\n");

  // Write weak candidates
  if (weak.length > 0) {
    const lines = [
      "# Tip Candidates",
      "",
      "Weak tips from last refresh. Review and `/tips add` any worth keeping.",
      "",
      ...weak.map(({ tip, category }) => `- [${category}] ${tip}`),
      "",
    ];
    fs.writeFileSync(candidatesFile, lines.join("\n"));
    console.log(`Candidates: ${weak.length} written to ${candidatesFile}`);
  }

  console.log(`Strong: ${strong.length} added to ${tipsFile}`);
  console.log(`Duplicates skipped: ${items.length - strong.length - weak.length}`);

  // Validate output
  try {
    JSON.parse(fs.readFileSync(tipsFile, "utf-8"));
    console.log("tips.json: valid");
  } catch (e) {
    console.error("WARNING: tips.json is invalid JSON after write:", e.message);
    process.exit(1);
  }
});
