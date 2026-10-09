// Hardcoded-value guard (frontend.md §4): fails on literal colours/arbitrary values in views, so
// the design-system contract (tokens + src/components/ui/**) stays the only source of styling.
// Zero dependencies on purpose. Run: node scripts/ui-scan.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOTS = ["src/components", "src/pages"];
const EXTENSIONS = new Set([".tsx", ".astro"]);
const EXCLUDED_DIR_SEGMENTS = new Set(["styles"]);

// Paths exempt from the scan with a stated reason — keep empty unless a real false positive shows up.
const ALLOWLIST = [];

const PATTERN =
  /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|-\[[0-9.]+(px|rem)\]|\b(bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/g;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIR_SEGMENTS.has(entry)) continue;
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      walk(path, files);
    } else if (EXTENSIONS.has(extname(path))) {
      files.push(path);
    }
  }
  return files;
}

function isAllowed(filePath) {
  return ALLOWLIST.some((allowed) => filePath.replaceAll("\\", "/").endsWith(allowed));
}

const hits = [];

for (const root of ROOTS) {
  for (const filePath of walk(root)) {
    if (isAllowed(filePath)) continue;
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    lines.forEach((line, index) => {
      const matches = line.match(PATTERN);
      if (matches) {
        hits.push({ filePath, line: index + 1, matches });
      }
    });
  }
}

if (hits.length > 0) {
  for (const hit of hits) {
    console.error(`${hit.filePath}:${hit.line} — ${hit.matches.join(", ")}`);
  }
  console.error(`\n${hits.length} hardcoded-value hit(s). Use a design token or a src/components/ui/** recipe instead.`);
  process.exit(1);
}

console.log("ui-scan: clean — no hardcoded colours/arbitrary values in views.");
