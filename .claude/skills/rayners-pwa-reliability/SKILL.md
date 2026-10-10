---
name: rayners-pwa-reliability
description: Manages the Rayners Lane service worker, Lane HQ install and update behaviour, and interruption recovery. Use when changing sw.js, admin-manifest.json/manifest.json, js/hq-pwa.js, the PWA parts of js/components.js, or when someone reports a recurring "Update now" bar, an install button that does nothing, or work lost to a reload.
---

# Rayners PWA reliability

## Purpose
An update prompt appears only when a genuinely new version is waiting, once,
and never reloads over unsaved work. Installation is offered only where the
browser can do it, never as a nag. Chrome's own "New Chrome available" notice is
the BROWSER updating itself — not the site; never "fix" it.

## How it works (keep it this way)
| Piece | Behaviour |
|---|---|
| `sw.js` | Network-first. `VERSION` + `CACHE` constants. Install does NOT `skipWaiting()`; it waits for `{type:'SKIP_WAITING'}`. Answers `{type:'GET_VERSION'}` on a MessageChannel. |
| Public pages (`js/components.js`) | Let a waiting worker in silently (network-first means nothing changes on screen) and do NOT reload on `controllerchange`. Install banner: phones only, only after `beforeinstallprompt` or on iPhone Safari, never after dismiss/install (`rlfc_pwa_dismissed`). Nav install button hidden unless installable. |
| Lane HQ (`js/hq-pwa.js`) | Update signal = a new worker `installed` while a controller exists, or another tab's takeover (`controllerchange` not requested here). One bar (`#hq-update`), version shown, "Later" holds per version per session (`hq_update_later`). "Reload now" asks `window.hqUnsavedWork()` first. Install only in the account menu (`installMode()` = `prompt` / `ios` / null). |
| Unsaved work (`admin.html`) | `hqUnsavedWork()`: Match Day Ops `MDOps.isBusy()` or a trusted `input` in the open panel since its last confirmed save (`toast` success / `portalSaid` non-failed clears it). |

## Trigger conditions
- Any edit to `sw.js`, the manifests, `js/hq-pwa.js`, the PWA section of `js/components.js`.
- Shipping HQ code (HTML/JS/CSS) that open tabs must pick up.
- Reports of repeated update bars, dead install buttons, lost edits.

## Inputs
The files above; `quality/tests/hq.spec.js` "Lane HQ G".

## Steps
1. Releasing HQ code: bump `VERSION` (date-tag) AND `CACHE` (`rlfc-vN+1`) in
   `sw.js` in the same commit. Nothing else may raise the HQ update bar — never
   reintroduce polling admin.html's etag/content-length (every Save re-stamps it).
2. Never call `skipWaiting()` unconditionally; never `location.reload()` on
   `controllerchange` unless this page requested the update.
3. New editor that can hold unsaved state? Make sure its inputs live inside a
   `.panel` (tracked automatically) or extend `hqUnsavedWork()`.
4. Install UI: only behind `HQPwa.installMode()` / `beforeinstallprompt`; hide
   when `display-mode: standalone` or after `appinstalled`.
5. Run the scenario test (below) — it uses a real service worker and changes
   `sw.js` bytes mid-test.

## Dependencies
`rayners-behaviour-auditor`, `rayners-release-visual-gate`.

## Expected outputs
One update bar per new version; zero forced reloads; install offered only where possible.

## Failure conditions
Bar on first install; bar after a data save; two bars; reload while
`hqUnsavedWork().dirty`; bar persisting after the update; enabled install action
that only shows an alert on desktop Chrome.

## Test requirements
`npx playwright test hq.spec.js -g "Lane HQ G" --project=desktop-1440`
(first install → no bar; new sw.js → one bar with version; unsaved edit → refused
with explanation; after save → reload onto new version; bar cleared).
`node --test tests/programme-surfaces.test.js` (cache name floor).
