# Fan Zone and the matchday programme — a guide for the committee

*Written 2 August 2026. Plain English. No technical detail.*

---

## The short version

The programme is **free**. It is not for sale and it never will be. What we ask for is a
Fan Zone account, so that we know who our supporters are and can look after them.

Anyone can see the cover, the two teams, the date, the venue and — once the match is
over — the final score. To read the programme itself, a supporter signs in.

**Right now, that sign-in does not work.** The lock is fitted and working. The key does
not turn. Nobody can read a complete programme at the moment, including our existing
supporter. This is being fixed and nothing has been lost — but the committee should know
the position before anyone promotes the programme.

---

## What a supporter sees today

**Someone who is not signed in** opens a programme link and gets the cover, the two club
badges, the competition and the date, the final score if the match has finished, and an
invitation to join Fan Zone. They do not see the articles, the line-ups, the league
table, the sponsors' pages or the club information page.

That is the intended experience, and it works.

**Someone who has already joined Fan Zone** sees exactly the same thing. That is the
fault. The programme page cannot currently tell that they are signed in.

---

## What went wrong

Two things, and neither of them is a data problem.

**One.** The programme pages were never given the small piece of software that reads a
supporter's sign-in. The pages ask "who is this?", get no answer, and assume the visitor
is a stranger. Our own members are treated as strangers.

**Two.** Joining Fan Zone does not currently create a membership record. Signing up
creates the account and the Lane Card, but the membership register the programme checks
against stays empty. So even once the first fault is fixed, an existing supporter would
still be turned away until they are added to that register.

Both are missing connections between parts we already have. No supporter data has been
lost, nothing has been deleted, and no rebuild is needed.

---

## What is not wrong

It is worth being just as clear about this.

**No unauthorised person can read a programme.** The check happens on our server, not in
the visitor's browser, and it is made against our supporter database every single time.
It cannot be defeated by editing a web page, guessing a web address or turning off
JavaScript. Every fault above fails in the safe direction: the programme stays shut.

**Draft and unpublished programmes are invisible to everyone**, members included. A
programme that has not been published behaves as though it does not exist. There is no
way to read next week's programme early.

**Supporter records are private.** Each supporter can see only their own record. Nobody
can list our membership, and the database refuses such a request outright rather than
relying on a page to hide it.

**We keep very little.** For each supporter: name, email, their membership number, when
they joined, and how they found us. Separately, a short record of meaningful things they
have done — account created, programme opened, match attended. That is all. There is no
tracking of what they click or how long they read for, and no such record exists to be
created later by accident.

**Marketing consent is a separate decision.** Choosing not to receive our emails does
not affect programme access in any way, and we never treat joining as agreement to be
emailed.

**The cookie banner now does what it says.** Previously, Decline removed the banner and
changed nothing — Google Analytics ran either way. That has been corrected. Nothing
analytics-related now loads until a visitor accepts, declining is honoured on every
future visit, and declining does not sign anybody out.

---

## Do supporters have a profile?

Partly. A signed-in supporter has a Fan Zone page showing their name, their Lane Card
with its QR code, when they joined, how many matches they have attended, their current
streak and their progress towards the next reward. That all works today.

What they do **not** have is anywhere to see the programmes they have read, change
whether they hear from us by email, or manage their account settings. We record the
programme history; we simply do not show it to them yet. That page is on the list, and
it is deliberately not urgent.

## What happens to supporters who joined before all this?

Nothing bad. Their Lane Card, their number, their attendance record and their rewards
progress are untouched and still work exactly as before.

What has not happened yet is adding them to the new membership register that the
programme checks. Until that connection is built they will be treated as non-members by
the programme — which, today, is how everyone is treated. When it is built, their
existing number and joining date come with them; the system is written to claim an
existing supporter rather than create a second one. Nobody will be asked to join twice
and nobody's number will change.

## What staff should do when a supporter cannot open a programme

**Today, the honest answer is: they cannot, and it is not their fault.** Apologise, tell
them it is a fault at our end that is being fixed, and point them to the cover and the
final score, which are public. Do not ask them to sign up again, clear their browser, or
try a different device — none of that will help, and it makes them feel it is their
problem.

Once the fix is live, work through this in order:

1. **Are they signed in?** Ask them to open the Fan Zone page. If they do not see their
   Lane Card, they are not signed in.
2. **Is the programme actually published?** If the page says the programme is not
   available, that is not about their membership. Programmes go live on matchday once
   both teams are confirmed.
3. **Did they join before the membership register existed?** They may need to be added
   once. Take their name and email and pass it on — do not create a second account for
   them.
4. **Anything else** — take their name, email and the match they were trying to read,
   and send it to info@raynerslanefc.co.uk. Do not ask them for a password. We will
   never need one.

## Our legal identity in the programme

The FA's Standardised Rules require every club to publish its legal name, its form and
its identifier in the matchday programme and on the website. The programme now carries:

> Rayners Lane Football Club
> Operated by Rayners Lane Football Club Limited · Company No. 17110511

That requirement is now fully met. The earlier warning about missing company details has
been removed because the details are no longer missing.

The club has confirmed that no separate electronic-only programme approval is required
for our Step 5 operation, so nothing is outstanding on that point either.

---

## What needs to happen next

In order:

1. Connect the sign-in reader to the programme pages.
2. Make joining Fan Zone create the membership record, at the moment someone joins.
3. Make the "Join Fan Zone" button on the programme carry the supporter back to the
   programme they came from.
4. Guarantee membership numbers are unique before we have many members. At present two
   supporters could be issued the same number.

Once those four are done, the journey works end to end and should be tested with one
real account before the programme is promoted anywhere.

Still to build, and deliberately not urgent: a page where a supporter can see their own
programme history, a committee report on how many people a given edition brought in, and
joining the footer newsletter sign-up to the same supporter register.

---

## The one thing to remember

**Do not promote the programme as a Fan Zone benefit until the sign-in works.** Anyone
who joins on that promise today will join, come back, and be shown the same locked page.
That is a worse first impression than not having offered it.

Until then the programme cover, the teams and the final score are all public, and can be
shared freely.

---

*Questions: info@raynerslanefc.co.uk. The technical record sits in
`docs/fan-zone-membership-and-programme-access.md`.*
