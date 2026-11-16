#!/usr/bin/env node
// Stop: sweep everything this turn changed before the agent finishes, one retry.
// Node instead of bash/jq: this host has no jq.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

process.env.NO_COLOR = "1";
process.env.FORCE_COLOR = "0";

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function sh(cmd, args, cwd) {
  try {
    const out = execFileSync(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    return { ok: true, out };
  } catch (err) {
    return { ok: false, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

// On Windows "npx" resolves to npx.cmd, which execFileSync cannot spawn
// directly without a shell (throws ENOENT even when npx exists).
function npx(args, cwd) {
  try {
    const out = execFileSync("npx", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      shell: true,
    });
    return { ok: true, out };
  } catch (err) {
    if (err.code === "ENOENT") return { ok: false, out: "npx not found on PATH" };
    return { ok: false, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

const raw = readStdin();
let data = {};
try {
  data = JSON.parse(raw);
} catch {
  // no payload -> treat as empty, still run the sweep against cwd
}

// Already sent back once by this hook this turn: let it finish.
if (data?.stop_hook_active === true) process.exit(0);

const cwd = data?.cwd && existsSync(data.cwd) ? data.cwd : process.cwd();
const sessionId = String(data?.session_id ?? "").replace(/[^A-Za-z0-9_-]/g, "");

const roots = new Set();
const sessionRoot = sh("git", ["-C", cwd, "rev-parse", "--show-toplevel"], cwd);
if (sessionRoot.ok) roots.add(sessionRoot.out.trim());

if (sessionId) {
  const registry = resolve(tmpdir(), "claude-hooks", `${sessionId}.roots`);
  if (existsSync(registry)) {
    for (const line of readFileSync(registry, "utf8").split("\n")) {
      const r = line.trim();
      if (r && existsSync(r)) roots.add(r);
    }
  }
}

if (roots.size === 0) {
  process.stdout.write(
    JSON.stringify({
      systemMessage: `end-of-turn.mjs: no git checkout at ${cwd}, nothing checked.`,
    }),
  );
  process.exit(0);
}

const COVERED = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".astro"];
let report = "";

for (const root of roots) {
  const diff = sh("git", ["-C", root, "diff", "--name-only", "HEAD"], root);
  const untracked = sh("git", ["-C", root, "ls-files", "-o", "--exclude-standard"], root);
  const changed = [...(diff.ok ? diff.out.split("\n") : []), ...(untracked.ok ? untracked.out.split("\n") : [])]
    .map((f) => f.trim())
    .filter(Boolean);
  if (changed.length === 0) continue; // nothing changed this turn in this checkout

  const files = [...new Set(changed)].filter(
    (f) => COVERED.some((ext) => f.endsWith(ext)) && existsSync(resolve(root, f)),
  );

  if (files.length > 0) {
    const lint = npx(["--no-install", "eslint", "--quiet", ...files], root);
    if (!lint.ok) {
      report += `\nESLint errors in changed files (${root}):\n${lint.out}\n`;
    }
    const tests = npx(["--no-install", "vitest", "related", ...files, "--run"], root);
    if (!tests.ok) {
      report += `\nTests related to changed files fail (${root}):\n${tests.out}\n`;
    }
  }

  const typecheck = npx(["--no-install", "astro", "check"], root);
  if (!typecheck.ok) {
    report += `\nTypecheck fails (${root}):\n${typecheck.out}\n`;
  }
}

if (report) {
  process.stderr.write(`Fix these before you finish:${report}`);
  process.exit(2);
}

process.exit(0);
