#!/usr/bin/env node
// PostToolUse hook: fires after any file edit. If the edited file is
// context/foundation/roadmap.md, it injects a reminder asking the main agent to
// confirm with the user before syncing GitHub issues via the github-issue-manager
// subagent. It never syncs by itself — it only surfaces the prompt.
//
// Wired in .claude/settings.json under hooks.PostToolUse (matcher Edit|Write|MultiEdit).
// Cross-platform: invoked as `node .claude/hooks/roadmap-sync-reminder.mjs` so no
// shell-specific syntax is involved. Reads the hook payload as JSON on stdin.

import { readFileSync } from "node:fs";

function bail() {
  // Silent no-op: never block the tool, never add noise on unrelated edits.
  process.exit(0);
}

let raw = "";
try {
  raw = readFileSync(0, "utf8");
} catch {
  bail();
}

let data;
try {
  data = JSON.parse(raw);
} catch {
  bail();
}

const filePath = String(data?.tool_input?.file_path ?? "").replace(/\\/g, "/");
if (!/context\/foundation\/roadmap\.md$/i.test(filePath)) {
  bail();
}

const message = [
  "ROADMAP CHANGED: context/foundation/roadmap.md was just edited.",
  "Before doing anything else, ASK the user (in the language they are writing in)",
  "whether they want to sync the GitHub issues to match the roadmap now.",
  'If — and only if — they say yes, delegate to the "github-issue-manager" subagent',
  '(Agent tool, subagent_type: "github-issue-manager"), passing a one-line summary of',
  "what changed in the roadmap. Do NOT sync, edit issues, or spawn the agent without",
  "explicit confirmation. If they decline, drop it silently.",
].join(" ");

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: message,
    },
  }),
);
