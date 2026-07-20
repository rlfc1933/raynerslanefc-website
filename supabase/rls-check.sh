#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# RLS proof for the `submissions` table.
# Run this AFTER applying supabase/submissions.sql in the Supabase SQL editor.
#
# It uses ONLY the public browser (publishable/anon) key — the same key any
# visitor's browser has. If RLS is locked down correctly:
#   • ANON READ  → HTTP 200 with an empty array  []   (row-level security hides all rows)
#   • ANON WRITE → HTTP 401/403 (permission denied)   (no anon insert policy exists)
# Neither should ever return real data or succeed.
#
# Usage:  bash supabase/rls-check.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

URL="https://rewkixywfgsyqinfbggv.supabase.co"
KEY="sb_publishable_7Iwtr1OlGo-VeysFkLcwcw_JjDU6DWE"   # public browser key (safe to ship)

echo "── ANON READ (should be 200 + [] , or 404 if the table isn't created yet) ──"
curl -s -w "\nHTTP %{http_code}\n" \
  "$URL/rest/v1/submissions?select=*&limit=5" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"

echo
echo "── ANON WRITE (should be 401/403 — blocked) ──"
curl -s -w "\nHTTP %{http_code}\n" \
  -X POST "$URL/rest/v1/submissions" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"other","name":"RLS-TEST-should-be-blocked"}'

echo
echo "PASS if: read = 200 [] (empty) and write = 401/403 (denied)."
echo "If read shows rows or write returns 201, an anon policy leaked in — remove it."
