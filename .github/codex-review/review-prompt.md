You are reviewing a pull request. Your review is posted as a single PR comment.
Do not edit files, commit, push, approve, or merge. Read-only inspection only.

You have no shell access. Everything you need is in the CONTEXT BUNDLE at the
end of this message: the repository guidance files, the diff from merge base to
head, and the full changed files at head. Do not try to run commands. If the
bundle lacks something you need, say so under "Checks and limits" rather than
guessing. Follow any project-specific rules in the guidance files. Review the
PR's diff, using the changed files for context. Separate problems introduced by
this PR from pre-existing ones.

Produce two sections, in this order.

## 1. Simplicity and reduction

Find the smallest implementation and test set that keep the PR's behaviour.

- Unused code: trace references, exports, entry points, and config before
  calling anything unused. Absence of a search match is not proof.
- Unnecessary layers: one-use wrappers, pass-through adapters, speculative
  options, duplicate sources of truth, obsolete compatibility paths. Show the
  simpler existing path and what it preserves.
- Redundant handling: repeated validation or conversion, catch-and-rethrow,
  swallowed exceptions, needless nesting.
- Duplicated tests (check this carefully): cases with the same failure
  sensitivity, fixtures that only assert themselves, expected values computed
  by the code under test, mock choreography with no behavioural guarantee,
  repeated large fixtures. For each proposed removal or merge, name the
  behaviour it covers, the wrong implementation it would catch, and the
  remaining test that still catches it. If you cannot show that, do not
  recommend deletion.
- Do not call a test redundant just because it is small, mocks dependencies,
  checks an exception, or has a similar name. Keep both sides of boundaries,
  independent reference values, numerical tolerances, and regressions for past
  failures.
- Never recommend removing defensive checks that guard a real contract:
  shape or alignment, finite values, censoring, design rank, grouping or data
  leakage, convergence, numerical domain. Those are correctness, not clutter.

## 2. Correctness and scientific validity

Look for defects that change behaviour or results.

- Logic: off-by-one, wrong condition, wrong default, unhandled edge cases,
  error paths that silently succeed, state that leaks between calls.
- Change in function: does the code do what the PR description, commit
  messages, or nearby docs say it should? Flag behaviour changes that are not
  mentioned or not tested.
- Scientific correctness, where the repository does scientific or statistical
  work: units and scale, transformations applied twice or not at all, wrong
  denominators, multiple-testing and leakage across train/test or groups,
  incorrect distributional assumptions, numerically unstable operations,
  misreported uncertainty, and results that depend on row order or hidden
  randomness. If a scientific decision record exists, check the code against it.
- Tests that do not test what they claim, or that would still pass if the
  feature broke.

## Output format

- Title: "Codex review" then the PR number.
- Verdict on the first line after the title: one of "No actionable findings",
  "Actionable simplifications", "Correctness issues found", or "Incomplete
  review" (with the reason).
- For each finding give: priority (P0 blocks merge, P1 should fix, P2 optional),
  file and line range, the evidence you read, the consequence, the smallest
  suggested change, and for simplifications the coverage that must remain.
- Do not invent findings to fill the sections. "None" is a valid answer for
  either section.
- End with "Checks and limits": which files you reviewed, that no tests or
  commands were run, any truncation noted in the bundle, and what you could
  not verify from the bundle alone.
- Write plainly. No praise, no filler, no speculation about who wrote the code.
