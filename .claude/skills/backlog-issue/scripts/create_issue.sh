#!/usr/bin/env bash
# Creates one backlog issue in this project's standard shape:
# Conventional-Commits-style title, a fixed body template, and a
# required type + priority label pair. See ../SKILL.md for the standard
# this enforces — this script is the mechanical half of it.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: create_issue.sh --type TYPE --scope SCOPE --summary TEXT --priority PRIORITY --body-file FILE [options]

Required:
  --type TYPE          feat|fix|refactor|chore|docs|test|ci|style
  --scope SCOPE         short module name, e.g. export, size-charts, a11y
  --summary TEXT        the part after "type(scope): " — imperative, lowercase start
  --priority PRIORITY   urgent|high|medium|low
  --body-file FILE      path to the issue body (Context/Why/Acceptance criteria)

Options:
  --repo OWNER/NAME     defaults to the repo `gh` infers from the current directory
  --type-label NAME     override the type->label mapping (e.g. "question")
  --dry-run             print what would be created; do not call gh
  -h, --help            show this help
EOF
}

type="" scope="" summary="" priority="" body_file="" repo="" type_label_override="" dry_run=0

while [ $# -gt 0 ]; do
  case "$1" in
    --type) type="$2"; shift 2 ;;
    --scope) scope="$2"; shift 2 ;;
    --summary) summary="$2"; shift 2 ;;
    --priority) priority="$2"; shift 2 ;;
    --body-file) body_file="$2"; shift 2 ;;
    --repo) repo="$2"; shift 2 ;;
    --type-label) type_label_override="$2"; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 1 ;;
  esac
done

for f in type scope summary priority body_file; do
  if [ -z "${!f}" ]; then
    echo "Missing required --$f" >&2
    usage >&2
    exit 1
  fi
done

if [ ! -f "$body_file" ]; then
  echo "Body file not found: $body_file" >&2
  exit 1
fi

case "$type" in
  feat|fix|refactor|chore|docs|test|ci|style) ;;
  *)
    echo "Invalid --type '$type' — must be one of: feat fix refactor chore docs test ci style" >&2
    exit 1
    ;;
esac

case "$priority" in
  urgent|high|medium|low) ;;
  *)
    echo "Invalid --priority '$priority' — must be one of: urgent high medium low" >&2
    exit 1
    ;;
esac

if [ -z "$repo" ]; then
  repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
fi

# type -> GitHub label. fix/feat/docs map to GitHub's own default labels;
# everything else that isn't naturally a bug or docs change reads as an
# enhancement (a scoped improvement), which is the common case for
# refactor/chore/test/ci/style backlog items. Pass --type-label to override
# for the odd case that's really a question or something else.
if [ -n "$type_label_override" ]; then
  type_label="$type_label_override"
else
  case "$type" in
    fix) type_label="bug" ;;
    feat) type_label="enhancement" ;;
    docs) type_label="documentation" ;;
    *) type_label="enhancement" ;;
  esac
fi

priority_label="priority: $priority"
title="${type}(${scope}): ${summary}"

ensure_label() {
  local name="$1" color="$2" desc="$3"
  if ! gh label list --repo "$repo" --json name -q '.[].name' | grep -qxF "$name"; then
    echo "Creating missing label '$name' on $repo" >&2
    if [ "$dry_run" -eq 0 ]; then
      gh label create "$name" --repo "$repo" --color "$color" --description "$desc" >/dev/null
    fi
  fi
}

# Known colors/descriptions for labels this script might need to create on a
# repo that doesn't have them yet (a fresh repo, or one without the priority
# tier this project added). GitHub's own defaults are reused verbatim for the
# type labels so a repo that already has them is untouched.
declare_label_meta() {
  case "$1" in
    bug) echo "d73a4a|Something isn't working" ;;
    enhancement) echo "a2eeef|New feature or request" ;;
    documentation) echo "0075ca|Improvements or additions to documentation" ;;
    question) echo "d876e3|Further information is requested" ;;
    "priority: urgent") echo "b60205|Drop everything, pull this next" ;;
    "priority: high") echo "d93f0b|Do next" ;;
    "priority: medium") echo "fbca04|Worth doing, not urgent" ;;
    "priority: low") echo "c2e0c6|Nice to have, someday" ;;
    *) echo "ededed|" ;;
  esac
}

for label in "$type_label" "$priority_label"; do
  meta="$(declare_label_meta "$label")"
  color="${meta%%|*}"
  desc="${meta#*|}"
  ensure_label "$label" "$color" "$desc"
done

echo "Repo:     $repo"
echo "Title:    $title"
echo "Labels:   $type_label, $priority_label"
echo "Body:"
sed 's/^/  /' "$body_file"

if [ "$dry_run" -eq 1 ]; then
  echo
  echo "(dry run — no issue created)"
  exit 0
fi

gh issue create --repo "$repo" --title "$title" --body-file "$body_file" \
  --label "$type_label" --label "$priority_label"
