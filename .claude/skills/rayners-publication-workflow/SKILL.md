---
name: rayners-publication-workflow
description: The life of a Rayners Lane FC graphic after it is made — draft, ready for review, approved, exported, published, archived — revisions, sponsor-logo versions, the asset library, and links to programmes, news, sponsorship and social drafts. Use when changing studio-assets rules, states, revisions, exports records, logo versioning, or connecting another HQ area (Programmes, Sponsors, News) to Asset Studio.
---

# Rayners publication workflow

## Purpose
Keep what the club approved, exported and published traceable and
unchangeable, while letting people correct mistakes through new revisions.

## Trigger conditions
- Editing `js/studio/backend.js`, `netlify/functions/studio-assets.js`, `supabase/migrations/*asset_studio*.sql`.
- Adding a state, a channel, or a link from Programmes/Sponsors/News into the Studio.
- Scenarios B (fixture changed), D (sponsor logo updated), F (interrupted work).

## Inputs
- States and moves: `StudioCore.STATES`, `FLOW`, `guardMove`, `saveOutcome`.
- Rules (one copy): `js/studio/backend.js`, run by the function over Supabase and by the browser over localStorage only when the server library is unreachable (the Studio then shows "Saved on this device only").
- Tables: `studio_compositions`, `studio_revisions` (approved docs immutable by trigger), `studio_exports` and `studio_publications` (append-only), `studio_sponsor_logos` (one current per sponsor), `studio_assets`; audit in `hq_audit`.

## Steps
1. **Save = new revision.** Every save names `base_rev`; a stale base returns `conflict` (local copy kept). The same person repeating the same save is not a conflict.
2. **Review and approval.** `draft → review → approved`. The server re-runs `factChecks` and refuses if anything blocks; the browser may only add its layout blocks.
3. **Edits after approval** create revision N+1 as a draft; `approved_rev` stays, and final files keep coming from it until a new approval.
4. **Exports** are recorded with revision, format, kind, size, bytes, sha256, filename and a thumbnail. Final only from `approved_rev`; drafts download as PROOF (watermarked, recorded `proof=true`). First final export moves approved → exported.
5. **Publication** is recorded by a person with channel + live URL (`move to published`). No automatic posting exists; never add one without an authorised integration and human approval.
6. **Sponsor logos.** Upload = new version (`needs_review`, ground light/dark, ≥300 px). Approve = becomes current, previous current retired (kept). Documents pin `refs.logoVersion`; old graphics stay historically accurate and get a "newer logo" warning; new graphics use current.
7. **Registry changes (B).** Documents snapshot `facts.fixture`; on open, `factDiff` lists what changed and the person chooses "Use the registry facts" (new revision) or "Keep as made". Never auto-overwrite.
8. **Interrupted work (F).** Every edit autosaves to `localStorage['rlfc-studio-autosave-v1']`; opening the Studio offers it back.
9. **Programme link.** Programme HQ should open `StudioApp.open({ template: 'programme-cover' })` (or `'programme-advert'`) for its fixture rather than creating a separate task; the approved A4 PDF is the deliverable. Changing a cover is a new revision — the published edition's approved revision is never altered.
10. **Migration.** Write migrations, never apply to production from here; state in the report what must be applied.

## Dependencies
`js/studio/core.js`, `js/studio/backend.js`, `netlify/functions/lib/studio/supabase-adapter.js`, `quality/tests/support/fake-supabase.js` (mirrors the triggers), `lib/pin.js` (committee password).

## Expected outputs
Rules changes covered by tests; migration idempotent and verified against a throwaway Postgres; report lists migrations to apply.

## Failure conditions
- Any path that updates `studio_revisions.doc`, deletes a revision, or mutates an export/publication row.
- "Published" without a URL; "exported" without an export record.
- A pending (unapproved) logo used by default.
- Device-only storage presented as shared.

## Test requirements
`node --test tests/studio-asset-library.test.js`; `quality/tests/studio.spec.js` Scenarios C, D, F and the "device only" journey; migration check (apply twice; approved doc update, revision delete, second current logo and export update must all fail).
