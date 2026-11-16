/**
 * Proof for the quality-gate hooks (lint-edited-file.mjs, end-of-turn.mjs): each case pipes a
 * sample Claude Code payload into the real script, inside a throwaway git repo, and asserts the
 * exit code / output channel. Run directly with `node --test` — this is a tooling test, not
 * part of the app's Vitest suite (see vitest.config.ts, which excludes .claude/**).
 *
 * The fixture repo symlinks this project's real node_modules (so the real eslint binary runs)
 * but gets its own minimal eslint.config.js — exercising the real linter without depending on
 * this app's type-aware config/tsconfig, which the fixture's plain .mjs files don't need.
 */
import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";

const LINT_HOOK = fileURLToPath(new URL("./lint-edited-file.mjs", import.meta.url));
const END_OF_TURN_HOOK = fileURLToPath(new URL("./end-of-turn.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const MINIMAL_ESLINT_CONFIG = [
  'import eslint from "@eslint/js";',
  "export default [eslint.configs.recommended];",
  "",
].join("\n");

let repo;

function git(...args) {
  return spawnSync("git", args, { cwd: repo, encoding: "utf8" });
}

function runHook(hookPath, payload) {
  return spawnSync(process.execPath, [hookPath], {
    cwd: repo,
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
  });
}

function winPath(p) {
  return p.replace(/\\/g, "/");
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "agent-hooks-"));
  writeFileSync(join(repo, ".gitignore"), "node_modules\n");
  writeFileSync(join(repo, "eslint.config.js"), MINIMAL_ESLINT_CONFIG);
  // Real eslint binary, without copying ~hundreds of MB: junction works without elevation on
  // Windows; a plain symlink on POSIX. Excluded from git by the .gitignore above.
  symlinkSync(join(REPO_ROOT, "node_modules"), join(repo, "node_modules"), "junction");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "clean.mjs"), 'export const ok = "fine";\n');
  writeFileSync(join(repo, "README.md"), "# fixture\n");
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

test("lint-edited-file.mjs: clean file -> exit 0, no block", () => {
  const file = join(repo, "src", "clean.mjs");
  const res = runHook(LINT_HOOK, {
    tool_name: "Edit",
    cwd: repo,
    session_id: "s1",
    tool_input: { file_path: winPath(file) },
  });
  assert.equal(res.status, 0);
});

test("lint-edited-file.mjs: file with a deliberate lint error -> exit 2, names the file", () => {
  const file = join(repo, "src", "broken.mjs");
  writeFileSync(file, "const unusedVarForHookTest = 1;\n");
  const res = runHook(LINT_HOOK, {
    tool_name: "Edit",
    cwd: repo,
    session_id: "s1",
    tool_input: { file_path: winPath(file) },
  });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /broken\.mjs/);
  assert.match(res.stderr, /unusedVarForHookTest/);
});

test("lint-edited-file.mjs: uncovered file type (README.md) -> exit 0", () => {
  const res = runHook(LINT_HOOK, {
    tool_input: { file_path: winPath(join(repo, "README.md")) },
    cwd: repo,
  });
  assert.equal(res.status, 0);
});

test("lint-edited-file.mjs: nonexistent file -> exit 0", () => {
  const res = runHook(LINT_HOOK, {
    tool_input: { file_path: winPath(join(repo, "src", "nope.mjs")) },
    cwd: repo,
  });
  assert.equal(res.status, 0);
});

test("lint-edited-file.mjs: empty payload -> exit 0", () => {
  const res = runHook(LINT_HOOK, {});
  assert.equal(res.status, 0);
});

test("lint-edited-file.mjs: unparseable payload -> exit 0", () => {
  const res = runHook(LINT_HOOK, "not json");
  assert.equal(res.status, 0);
});

test("end-of-turn.mjs: clean tree, no changes -> exit 0", () => {
  const res = runHook(END_OF_TURN_HOOK, { cwd: repo, stop_hook_active: false });
  assert.equal(res.status, 0);
});

test("end-of-turn.mjs: file rewritten outside the per-edit hook (no stage) -> exit 2, names it", () => {
  writeFileSync(join(repo, "src", "clean.mjs"), "const unusedVarForHookTest = 1;\n");
  const res = runHook(END_OF_TURN_HOOK, { cwd: repo, stop_hook_active: false });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /clean\.mjs/);
});

test("end-of-turn.mjs: stop_hook_active true -> exit 0 even with the error present", () => {
  writeFileSync(join(repo, "src", "clean.mjs"), "const unusedVarForHookTest = 1;\n");
  const res = runHook(END_OF_TURN_HOOK, { cwd: repo, stop_hook_active: true });
  assert.equal(res.status, 0);
});

test("end-of-turn.mjs: empty payload -> exit 0 (falls back to process cwd)", () => {
  const res = runHook(END_OF_TURN_HOOK, {});
  assert.equal(res.status, 0);
});
