---
name: programme-print-pdf
description: Use when producing or checking an A4 print/PDF edition — the reader through css/p-programme-print.css, validated by rendering a real PDF and looking at every page.
---

# Skill 09 — Print & PDF Production

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
Reliable UK A4 editions with consistent margins, running foot with page numbers, no blank or clipped pages, correct metadata.

## When to invoke
- Print stylesheet changes; before announcing a printable edition; a supporter reports a bad PDF.

## Required inputs
- A published edition id.

## Authoritative data sources
- `css/p-programme-print.css` (media=print). Paged.js / pdfme were evaluated and NOT added: Chromium already supports @page size, margin boxes and counters, so another engine would not earn its place.

## Workflow
1. Generate: Playwright `page.emulateMedia({media:"print"})` + `page.pdf({format:"A4", preferCSSPageSize:true, printBackground:true})` after dispatching `beforeprint` (sets the PDF Title to fixture · edition · version).
2. Validate: `pdfinfo` → A4 595x842pt, 2-12 pages, Title contains the version.
3. Render every page: `pdftoppm -r 50 -png file.pdf page` and LOOK at the PNGs.
4. Check text per page with `pdftotext -f n -l n` (no blank pages; "Page n of N" on every page after the cover).

## Expected output
A PDF plus page PNGs attached to the test report.

## Error handling
- Blank first page → something above the cover prints; the cover is `order:-1` in print.
- Stretched artwork → `object-fit: contain`, aspect checked in `sponsorPlacements()`.

## Approval requirements
Before any PRINTED distribution: FWP permission for API-derived data in print (programme-football-data).

## Verification tests
- `npx playwright test tests/programme.spec.js -g "REAL A4 PDF" --project=desktop-1440`

## Other skills it may call
- programme-typography-layout
- programme-visual-regression
