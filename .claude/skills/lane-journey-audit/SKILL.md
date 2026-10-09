---
name: lane-journey-audit
description: End-to-end interaction-journey audit of the Rayners Lane FC site by touch and keyboard — menu, fixtures, news→article, contact form validation, cookie consent, Staff HQ sign-in. Use after changing navigation, forms, consent, admin login or any interactive flow, and to add a journey for a new feature.
---

# Lane journey audit

## Run
`cd quality && npm run test:journeys` (desktop, tablet, phone, folded phone).

Current journeys (`tests/journeys.spec.js`):
1. Mobile menu — opens from keyboard, focus moves inside, Escape closes, focus returns.
2. Fixtures — next match and results render from data.
3. News → article — tap a story, the article and its headline render.
4. Contact — empty form is invalid and nothing is sent.
5. Cookies — no analytics request before a decision or after Decline (GA and Clarity).
6. Staff HQ — wrong password refused; committee password opens the portal.
7. Keyboard only — primary nav reachable, every focus visibly indicated.

## Adding a journey (required for every new interactive feature)
Write it as the person does it: arrive → act → see the result → recover from an
error. Use roles/labels (`getByRole`) not CSS where possible; mock Netlify
functions with `page.route('**/.netlify/functions/<name>', …)` using the function's
real rule; assert the outcome a user would notice, not implementation details.

## Real-world behaviour (Microsoft Clarity)
Clarity is wired into `js/consent.js` but OFF (`CLARITY_ID = ''`). When the club
turns it on (ID + a line in policies.html's analytics section), use its heatmaps,
rage-click and dead-click reports to choose which journeys to add or fix next.
It loads only after analytics consent and never on Staff HQ.
