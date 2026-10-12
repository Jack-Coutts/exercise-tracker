#!/usr/bin/env node
// Runs a Codex PR review as a T3 Code thread so it is visible (and can be
// followed up) in the T3 Code app. Uses the local server's orchestration HTTP
// API (T3 Code v0.0.45; internal, recheck after T3 updates).
//
// One thread per PR: the thread id is derived from repo + PR number, so a
// later push adds a new turn to the same thread. The review runs in a per-PR
// worktree of the local clone. Prints the review turn's final reply.
//
// Usage: T3_TOKEN=... node t3-review.mjs --project /abs/repo --worktree /abs/wt
//          --repo owner/name --pr N --branch ref --base SHA --head SHA
//          --prompt-file path [--timeout 3600]
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    project: { type: "string" },
    worktree: { type: "string" },
    repo: { type: "string" },
    pr: { type: "string" },
    branch: { type: "string" },
    base: { type: "string" },
    head: { type: "string" },
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
const git = (...a) => execFileSync("git", a, { encoding: "utf8" });

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
const deadline = Date.now() + Number(args.timeout) * 1000;

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

// Wait for any running turn (e.g. a follow-up) before touching its worktree.
while (thread?.session?.activeTurnId) {
  if (Date.now() > deadline) throw new Error("Timed out waiting for the thread to go idle");
  await sleep(5000);
  thread = await getThread();
}

// Check out the PR head in the per-PR worktree. Local edits from a follow-up
// are never discarded: the review fails instead, since it would not be
// reviewing the PR head.
git("-C", args.project, "fetch", "--quiet", "origin", args.base, args.head);
git("-C", args.project, "cat-file", "-e", `${args.base}^{commit}`);
git("-C", args.project, "cat-file", "-e", `${args.head}^{commit}`);
if (existsSync(args.worktree)) {
  if (git("-C", args.worktree, "status", "--porcelain").trim()) {
    throw new Error(`${args.worktree} has local edits; commit or remove them, then re-run the review`);
  }
  git("-C", args.worktree, "checkout", "--quiet", "--detach", args.head);
} else {
  git("-C", args.project, "worktree", "add", "--quiet", "--detach", args.worktree, args.head);
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

const prompt = readFileSync(args["prompt-file"], "utf8");

// Starts one review turn and waits for it. Resolves to the reply, or throws
// with the turn's error.
async function runTurn() {
  const requestedAfter = now();
  await dispatch({
    type: "thread.turn.start",
    threadId,
    message: { messageId: randomUUID(), role: "user", text: prompt, attachments: [] },
    modelSelection,
    runtimeMode,
    interactionMode,
    createdAt: now(),
  });
  console.error(`T3 thread ${threadId}: review turn started`);

  // The first turn requested after our dispatch is ours: the thread was idle,
  // so another turn can only be requested after it. Only that exact turn,
  // seen finished as the latest turn, counts; if another turn replaces it
  // before then, fail rather than guess at its outcome.
  let turnId = null;
  while (Date.now() < deadline) {
    await sleep(5000);
    const t = await getThread();
    const latest = t.latestTurn;
    if (!turnId) {
      if (!latest || latest.requestedAt < requestedAfter) continue;
      turnId = latest.turnId;
    }
    if (latest.turnId !== turnId) {
      throw new Error("Another turn started before the review turn was seen to finish");
    }
    if (latest.state === "running") continue;
    if (latest.state !== "completed") {
      throw new Error(`Review turn ended as ${latest.state}: ${t.session?.lastError ?? "no error"}`);
    }
    const reply = t.messages.find((m) => m.id === latest.assistantMessageId)?.text;
    if (!reply) throw new Error("Review turn completed without a reply");
    return reply;
  }
  throw new Error("Timed out waiting for the review turn");
}

// Model capacity errors are transient; retry those with backoff.
const backoffSeconds = [60, 180, 300];
for (let attempt = 0; ; attempt++) {
  try {
    process.stdout.write(await runTurn());
    break;
  } catch (error) {
    const transient = /capacity|overloaded|rate limit/i.test(error.message);
    if (!transient || attempt >= backoffSeconds.length) throw error;
    console.error(`${error.message}; retrying in ${backoffSeconds[attempt]}s`);
    await sleep(backoffSeconds[attempt] * 1000);
  }
}
