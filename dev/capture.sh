#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════
# DEV-ONLY VISUAL QA CAPTURE.
#
# Screenshots the REAL pages served on localhost to dev/screenshots/*.png so
# visual review is a file someone can open, not a claim in a report.
#
# Full-page shots hit fixtures.html directly. Single-card and expanded-state
# shots go through dev/qa-shot.html, which lifts the real rendered node out of
# the real page (see that file's header for why).
#
# Run the site first:  python3 -m http.server 9040
# Then:                bash dev/capture.sh
# ═════════════════════════════════════════════════════════════════════════
set -u
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE="${BASE:-http://localhost:9040}"
OUT="dev/screenshots"
mkdir -p "$OUT"

shot() { # shot <file> <w> <h> <url>
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=2 --virtual-time-budget=28000 \
    --window-size="$2,$3" --screenshot="$OUT/$1" "$4" >/dev/null 2>&1
  if [ -f "$OUT/$1" ]; then
    printf '  %-38s %s\n' "$1" "$(du -h "$OUT/$1" | cut -f1)"
  else
    printf '  %-38s FAILED\n' "$1"
  fi
}

card() { # card <file> <selector> <index> <open> <width> <label> <note>   (SRC=/page.html to change source)
  local url="$BASE/dev/qa-shot.html?src=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "${SRC:-/fixtures.html}")&sel=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$2")&n=$3&open=$4&w=$5&label=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$6")&note=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "${7:-}")"
  shot "$1" "$(( $5 + 60 ))" 900 "$url"
}

echo "── full pages ─────────────────────────────────────────"
shot fixtures-desktop.png       1440 2600 "$BASE/fixtures.html"
shot fixtures-mobile-375.png     375 2200 "$BASE/fixtures.html"
shot fixtures-mobile-390.png     390 2200 "$BASE/fixtures.html"
shot fixtures-mobile-430.png     430 2200 "$BASE/fixtures.html"

echo "── individual card states ─────────────────────────────"
# Indices are resolved against the live page, so these follow real data.
card fixture-next-match-fa-vase.png  ".fxh"                     0 0 1000 "Next match — Isuzu FA Vase, home vs New Bradwell St Peter" "real fixture"
card fixture-away-league.png         ".fxc--away.fxc--league"    0 0 1000 "Away league — Burnham" "real fixture"
card fixture-home-league.png         ".fxc--home.fxc--league"    0 0 1000 "Home league — Ardley United" "real fixture"
card fixture-fa-cup.png              ".fxc--cup"                 0 0 1000 "FA Cup — away at London Lions" "real fixture"
card fixture-neutral-fallback.png    ".fxc:not(.fxc--tinted)"    0 0 1000 "Neutral fallback — opponent palette unconfirmed" "real fixture"
card fixture-expanded-upcoming.png   ".fxc--s-upcoming"          0 1 1000 "Expanded — upcoming" "real fixture"
card fixture-expanded-finished.png   ".fxc--s-finished"          0 1 1000 "Expanded — finished" "real fixture"

echo "── mobile card states ─────────────────────────────────"
card fixture-mobile-375-collapsed.png ".fxc--away.fxc--league"   0 0 375 "Away league at 375px" "real fixture"
card fixture-mobile-375-expanded.png  ".fxc--s-upcoming"         0 1 375 "Expanded at 375px" "real fixture"

echo "── programme ──────────────────────────────────────────"
prog() { # prog <file> <pageIndex> <label>
  SRC=/programme-print.html card "$1" ".page" "$2" 0 820 "$3" "real programme document"
}
shot programme-print-full.png 1000 1420 "$BASE/programme-print.html"
prog programme-cover.png        0  "Programme — cover"
prog programme-contents.png     1  "Programme — page 2"
prog programme-manager.png      2  "Programme — page 3"
prog programme-opposition.png   3  "Programme — page 4"
prog programme-p5.png           4  "Programme — page 5"
prog programme-p6.png           5  "Programme — page 6"
prog programme-league-table.png 6  "Programme — page 7"
prog programme-p8.png           7  "Programme — page 8"
prog programme-sponsors.png     8  "Programme — page 9"

echo
echo "written to $OUT"
