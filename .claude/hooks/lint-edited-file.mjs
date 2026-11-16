#!/usr/bin/env node
// PostToolUse (Write|Edit): lint the file the agent just edited.
// Exit 2 + stderr is the only combination Claude Code shows to the agent.
// Node instead of bash/jq: this host has no jq (see .claude/skills/10x-configure-hook
// references/anthropic.md "No jq -> generate a Node script instead").

import { existsSync, appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute } from "node:path";
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

function gitToplevel(cwd) {
  try {
    return execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

function gitCommonDir(cwd) {
  try {
    const args = ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"];
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const raw = readStdin();
let data;
try {
  data = JSON.parse(raw);
} catch {
  process.exit(0); // no parseable payload -> nothing to check
}

const filePathRaw = data?.tool_input?.file_path ?? data?.tool_input?.notebook_path;
if (!filePathRaw) process.exit(0); // no path in payload -> nothing to check

const cwd = data?.cwd && existsSync(data.cwd) ? data.cwd : process.cwd();
const file = isAbsolute(filePathRaw) ? filePathRaw : resolve(cwd, filePathRaw);

const COVERED = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".astro"];
if (!COVERED.some((ext) => file.endsWith(ext))) process.exit(0); // uncovered type
if (!existsSync(file)) process.exit(0); // nonexistent file

const root = gitToplevel(dirname(file));
if (!root) process.exit(0); // not inside a git checkout

const repoCommon = gitCommonDir(root);
const sessionCommon = gitCommonDir(cwd);
if (!repoCommon || repoCommon !== sessionCommon) process.exit(0); // other repository, skip

// Register this checkout so the end-of-turn hook sweeps it too.
const sessionId = String(data?.session_id ?? "").replace(/[^A-Za-z0-9_-]/g, "");
if (sessionId) {
  try {
    const dir = resolve(tmpdir(), "claude-hooks");
    mkdirSync(dir, { recursive: true });
    appendFileSync(resolve(dir, `${sessionId}.roots`), `${root}\n`);
  } catch {
    // best-effort registration only
  }
}

const rel = relative(root, file).split("\\").join("/");
try {
  // shell: true — on Windows "npx" resolves to npx.cmd, which execFileSync cannot
  // spawn directly without a shell (throws ENOENT even when npx exists).
  execFileSync("npx", ["--no-install", "eslint", "--quiet", rel], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    shell: true,
  });
} catch (err) {
  if (err.code === "ENOENT") {
    process.stderr.write(`eslint is not installed/available — hook cannot verify ${rel}\n`);
    process.exit(2);
  }
  const output = (err.stdout ?? "") + (err.stderr ?? "");
  process.stderr.write(`ESLint reported errors in ${rel}:\n${output}\n`);
  process.exit(2);
}

process.exit(0);
