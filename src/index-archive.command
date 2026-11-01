#!/bin/bash
# Finds each strip in an archive by the YYYY-MM-DD in its filename and writes
# archive-index.js next to this script. Run it once, and again if the archive changes.
# Usage: double-click it, or run it with the archive folder as an argument.
set -u
export LC_ALL=C

here=$(cd "$(dirname "$0")" && pwd -P)
root=${1:-}
if [ -z "$root" ]; then
  printf 'Archive folder (press Return for %s): ' "$here"
  read -r root
  # A folder dragged into Terminal arrives with escaped spaces and a trailing space.
  root=$(printf '%s' "$root" | sed -e 's/\\\(.\)/\1/g' -e "s/^'\(.*\)'$/\1/" -e 's/[[:space:]]*$//')
  root=${root:-$here}
fi
cd "$root" || { echo "Can't open that folder: $root"; exit 1; }
root=$(pwd -P)

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Scanning $root ..."
find . \( -name '@eaDir' -o \( -name '.*' ! -name . \) \) -prune -o -type f \
  \( -iname '*.gif' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \) -print |
  sed 's|^\./||' | sort > "$tmp/files"

ROOT="$root" awk -v dates="$tmp/dates" -v dups="$tmp/dups" '
  function esc(s,   out, i, c) {
    out = ""
    for (i = 1; i <= length(s); i++) {
      c = substr(s, i, 1)
      if (c == "\\" || c == "\"") out = out "\\" c
      else if (c in ctl) out = out ctl[c]
      else out = out c
    }
    return out
  }
  BEGIN { for (i = 1; i < 32; i++) ctl[sprintf("%c", i)] = sprintf("\\u%04x", i) }
  {
    name = $0
    sub(/.*\//, "", name)
    if (!match(name, /(^|[^0-9])[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]([^0-9]|$)/)) next
    d = substr(name, RSTART, RLENGTH)
    match(d, /[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]/)
    d = substr(d, RSTART, 10)
    month = substr(d, 6, 2) + 0
    day = substr(d, 9, 2) + 0
    if (month < 1 || month > 12 || day < 1 || day > 31) next
    atStart = index(name, d) == 1
    if (d in file) {
      print d >> dups
      if (!atStart || first[d]) next
    }
    file[d] = $0
    first[d] = atStart
  }
  END {
    printf "window.ARCHIVE_INDEX={\"root\":\"%s\",\"files\":{", esc(ENVIRON["ROOT"])
    sep = ""
    for (d in file) {
      printf "%s\"%s\":\"%s\"", sep, d, esc(file[d])
      sep = ","
      print d > dates
    }
    print "}};"
  }
' "$tmp/files" > "$tmp/archive-index.js"

if [ ! -s "$tmp/dates" ]; then
  echo "No strips found. Filenames need a date like 2010-09-01."
  exit 1
fi
mv "$tmp/archive-index.js" "$here/archive-index.js"

sort -u "$tmp/dates" -o "$tmp/dates"
echo "Found $(wc -l < "$tmp/dates" | tr -d ' ') dated files. Wrote $here/archive-index.js"

if [ -f "$here/data.js" ]; then
  grep -o '"date":"[0-9-]*"' "$here/data.js" | cut -d'"' -f4 | sort -u > "$tmp/known"
  comm -13 "$tmp/dates" "$tmp/known" > "$tmp/missing"
  echo "Strips the app knows: $(wc -l < "$tmp/known" | tr -d ' '). Missing from this archive: $(wc -l < "$tmp/missing" | tr -d ' ')."
  head -10 "$tmp/missing"
fi
if [ -s "$tmp/dups" ]; then
  echo "Dates with more than one file, using one of them: $(sort -u "$tmp/dups" | wc -l | tr -d ' ')."
  sort -u "$tmp/dups" | head -10
fi
