/**
 * Shared utilities for claude-coach scripts.
 * Canonical implementations — all scripts require from here.
 */

const fs = require("fs");
const path = require("path");

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return null;
  }
}

function safeJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch { return null; }
}

function extractFrontmatter(content) {
  const normalized = (typeof content === "string" ? content : "").replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  let currentKey = null;
  let multiLineMode = null; // "quoted" | "block"
  for (const line of match[1].split("\n")) {
    if (currentKey && multiLineMode) {
      if (multiLineMode === "quoted") {
        fm[currentKey] += " " + line.trim().replace(/["']$/g, "");
        if (/["']$/.test(line.trim())) { currentKey = null; multiLineMode = null; }
      } else if (multiLineMode === "block") {
        if (/^\s/.test(line)) {
          fm[currentKey] += (fm[currentKey] ? " " : "") + line.trim();
        } else {
          currentKey = null; multiLineMode = null;
        }
      }
      if (currentKey) continue;
    }
    const sep = line.indexOf(":");
    if (sep > 0) {
      const key = line.slice(0, sep).trim();
      let val = line.slice(sep + 1).trim();
      if (val === ">" || val === "|") {
        fm[key] = "";
        currentKey = key;
        multiLineMode = "block";
      } else if (/^["']/.test(val) && /["']$/.test(val)) {
        fm[key] = val.slice(1, -1);
        currentKey = null; multiLineMode = null;
      } else if (/^["']/.test(val)) {
        fm[key] = val.slice(1);
        currentKey = key; multiLineMode = "quoted";
      } else {
        fm[key] = val;
        currentKey = null; multiLineMode = null;
      }
    }
  }
  return fm;
}

function findFiles(dirs, pattern) {
  const found = [];
  const isExact = !pattern.includes("*");
  const matchFn = isExact
    ? (name) => name.toLowerCase() === pattern.toLowerCase()
    : (name) => name.toLowerCase().endsWith(pattern.replace("*", "").toLowerCase());

  function walk(dir) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && matchFn(entry.name)) found.push(full);
      }
    } catch { /* skip inaccessible */ }
  }

  for (const dir of dirs) {
    try { if (fs.existsSync(dir)) walk(dir); } catch { /* skip */ }
  }
  return found;
}

function findMdFiles(dirs) {
  return findFiles(dirs, "*.md");
}

module.exports = { safeRead, safeJSON, extractFrontmatter, findFiles, findMdFiles };
