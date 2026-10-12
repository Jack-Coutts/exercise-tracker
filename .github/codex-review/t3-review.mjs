#!/usr/bin/env node
// Runs a Codex PR review as a T3 Code thread so it is visible (and can be
// followed up) in the T3 Code app. Uses the local server's orchestration HTTP
// API (T3 Code v0.0.45; internal, recheck after T3 updates).
//
// One thread per PR: the thread id is derived from repo + PR number, so a
// later push adds a new turn to the same thread. Prints the final assistant
// message of the review turn to stdout.
//
// Usage: T3_TOKEN=... node t3-review.mjs --project /abs/repo --worktree /abs/wt
//          --repo owner/name --pr N --branch ref --prompt-file path [--timeout 3600]
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    project: { type: "string" },
    worktree: { type: "string" },
    repo: { type: "string" },
    pr: { type: "string" },
    branch: { type: "string" },
    "prompt-file": { type: "string" },
    timeout: { type: "string", default: "3600" },
  },
});

const origin = JSON.parse(
  readFileSync(`${process.env.HOME}/.t3/userdata/server-runtime.json`, "utf8"),
).origin;
const headers = {
  authorization: `Bearer ${process.env.T3_TOKEN}`,
  "content-type": "application/json",
};

async function api(method, path, body) {
  const res = await fetch(origin + path, { method, headers, body: body && JSON.stringify(body) });
  const text = await res.text();
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}
const dispatch = (command) =>
  api("POST", "/api/orchestration/dispatch", { commandId: randomUUID(), ...command });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

// UUIDv5-style id from a name, so each PR maps to one stable thread.
function stableUuid(name) {
  const h = createHash("sha1").update(`t3-codex-review:${name}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

async function findProject() {
  const shell = await api("GET", "/api/orchestration/shell");
  return shell.projects.find((p) => p.workspaceRoot === args.project && !p.deletedAt);
}

let project = await findProject();
if (!project) {
  execFileSync("t3", ["project", "add", args.project], { stdio: "ignore" });
  project = await findProject();
  if (!project) throw new Error(`Could not add T3 project for ${args.project}`);
}

const modelSelection = {
  instanceId: "codex",
  model: "gpt-6.1-sol",
  options: [{ id: "reasoningEffort", value: "high" }],
};
// "auto": workspace-write sandbox confined to the worktree, approvals
// auto-reviewed, so the unattended turn never blocks waiting for a click.
const runtimeMode = "auto";
const interactionMode = "default";

// A deleted thread's id can be created again, so the id never changes.
const threadId = stableUuid(`${args.repo}#${args.pr}`);
const getThread = async () => (await api("GET", `/api/orchestration/threads/${threadId}`))?.thread;
let thread = await getThread();
if (!thread) {
  // The detail route 404s for archived threads too; unarchive if that is why.
  try {
    await dispatch({ type: "thread.unarchive", threadId });
    thread = await getThread();
  } catch {
    // Not archived: missing or deleted, so it is created below.
  }
}

if (!thread) {
  await dispatch({
    type: "thread.create",
    threadId,
    projectId: project.id,
    title: `Codex review: ${args.repo.split("/")[1]} #${args.pr}`,
    modelSelection,
    runtimeMode,
    interactionMode,
    branch: args.branch,
    worktreePath: args.worktree,
    createdAt: now(),
  });
  await dispatch({
    type: "thread.pull-request.link",
    threadId,
    host: "github.com",
    repository: args.repo,
    number: Number(args.pr),
    url: `https://github.com/${args.repo}/pull/${args.pr}`,
    source: "manual",
  });
}

const deadline = Date.now() + Number(args.timeout) * 1000;

// Wait for any turn already running in this thread (e.g. a follow-up).
while ((await getThread()).session?.activeTurnId) {
  if (Date.now() > deadline) throw new Error("Timed out waiting for the thread to go idle");
  await sleep(5000);
}

const requestedAfter = now();
await dispatch({
  type: "thread.turn.start",
  threadId,
  message: {
    messageId: randomUUID(),
    role: "user",
    text: readFileSync(args["prompt-file"], "utf8"),
    attachments: [],
  },
  modelSelection,
  runtimeMode,
  interactionMode,
  createdAt: now(),
});
console.error(`T3 thread ${threadId}: review turn started`);

// The first turn requested after our dispatch is ours: the thread was idle
// and any follow-up can only start after it. Pin its id so a later follow-up
// turn's answer is never mistaken for the review.
let turnId = null;
while (Date.now() < deadline) {
  await sleep(turnId ? 10000 : 2000);
  const t = await getThread();
  const latest = t.latestTurn;
  if (!turnId) {
    if (!latest || latest.requestedAt < requestedAfter) continue;
    turnId = latest.turnId;
  }
  if (latest.turnId === turnId && latest.state === "running") continue;
  if (latest.turnId === turnId && latest.state !== "completed") {
    throw new Error(`Review turn ended as ${latest.state}: ${t.session?.lastError ?? "no error"}`);
  }
  const reply = t.messages.filter((m) => m.role === "assistant" && m.turnId === turnId).at(-1)?.text;
  if (!reply) throw new Error("Review turn completed without a reply");
  process.stdout.write(reply);
  process.exit(0);
}
throw new Error("Timed out waiting for the review turn");
