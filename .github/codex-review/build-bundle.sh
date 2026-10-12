#!/usr/bin/env bash
# Builds the context bundle for the Codex review: repo guidance, the PR diff,
# and the changed files at head. Codex reads this bundle instead of running
# shell commands, so the review does not depend on a sandbox.
#
# Usage: build-bundle.sh <base-sha> <head-sha> <output-file>
set -euo pipefail

base=$1
head=$2
out=$3

max_file=120000 # bytes per file
max_diff=400000 # bytes of diff

tmp_file=$(mktemp)
trap 'rm -f "$tmp_file"' EXIT

truncate_to() {
  # Print stdin up to $1 bytes, noting when output was cut.
  local limit=$1 tmp
  tmp=$(mktemp)
  cat >"$tmp"
  head -c "$limit" "$tmp"
  if [ "$(wc -c <"$tmp")" -gt "$limit" ]; then
    printf '\n[truncated at %s bytes]\n' "$limit"
  fi
  rm -f "$tmp"
}

{
  echo "# Repository guidance"
  for f in AGENTS.md CLAUDE.md SPEC.md; do
    if [ -f "$f" ]; then
      echo "## $f"
      truncate_to "$max_file" <"$f"
    fi
  done

  echo "# Diff stat (merge base to head)"
  git diff --stat "$base...$head"

  echo "# Diff (merge base to head)"
  git diff --no-color "$base...$head" | truncate_to "$max_diff"

  echo "# Changed files at head"
  # -z keeps names raw; without it git quotes non-ASCII, tab, and newline names.
  git diff -z --name-only --diff-filter=AMR "$base...$head" | while IFS= read -r -d '' f; do
    case "$f" in
      *.lock | *.png | *.jpg | *.jpeg | *.pdf | *.gz | *.sqlite | *.ico | *.icns) continue ;;
    esac
    # Skip binary and empty files. Write to a temp file first: grep -q exiting
    # early would otherwise SIGPIPE git and fail the pipeline under pipefail.
    git show "$head:$f" >"$tmp_file"
    grep -qI . "$tmp_file" || continue
    echo "## $f"
    truncate_to "$max_file" <"$tmp_file"
  done
} >"$out"
