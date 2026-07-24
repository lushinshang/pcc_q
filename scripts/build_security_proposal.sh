#!/usr/bin/env bash
set -euo pipefail

proposal_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
proposal_source="$proposal_root/proposal/github-pages-sdd-tdd-security-proposal.md"
proposal_style="$proposal_root/proposal/proposal-style.html"
proposal_template="$proposal_root/proposal/pandoc-template.html"
proposal_output="$proposal_root/proposal/github-pages-sdd-tdd-security-proposal.html"
proposal_skill_dir="/Users/lanss/.codex/skills/md-to-phtml"
proposal_tmp_dir="$(mktemp -d)"
proposal_protected="$proposal_tmp_dir/proposal.protected.md"
proposal_normalized="$proposal_tmp_dir/proposal.normalized.md"

trap 'rm -rf "$proposal_tmp_dir"' EXIT

# The punctuation normalizer intentionally handles prose. Protect Markdown
# ordered-list markers so their syntax is not mistaken for Chinese punctuation.
perl -pe 's/^([0-9]+)\. /@@ORDERED_LIST_$1@@ /' \
  "$proposal_source" > "$proposal_protected"

python3 "$proposal_skill_dir/scripts/normalize_punctuation.py" \
  "$proposal_protected" \
  -o "$proposal_normalized"

perl -pi -e 's/@@ORDERED_LIST_([0-9]+)@@ /$1. /' "$proposal_normalized"

pandoc "$proposal_normalized" \
  --from="markdown+raw_html+fenced_divs+task_lists" \
  --to=html5 \
  --standalone \
  --section-divs \
  --toc \
  --toc-depth=2 \
  --template="$proposal_template" \
  --include-in-header="$proposal_style" \
  --metadata="pagetitle=GitHub Pages 靜態化遷移｜SDD × TDD × 資安驗證修改提案" \
  --output="$proposal_output"

python3 -m html.parser "$proposal_output"

echo "Built: $proposal_output"
