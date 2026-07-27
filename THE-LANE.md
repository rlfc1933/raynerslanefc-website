# The Lane — Club Memory, Rituals and Inheritance

**Written as chairman, not as engineer · 27 July 2026**
Sits *above* `VISION.md` and `ROADMAP.md`. When they conflict with this, this wins.

---

## What I am actually responsible for

Not a website. Not a portal. **The odds that in 2046 there is still a club called
Rayners Lane, playing in yellow and green at Tithe Farm, that feels like this
one.**

Everything else is instrumentation.

A football club is not its results. Rayners Lane have finished 11th of 22 and
been relegated without losing enough games to deserve it. A club is the set of
things it repeats until they mean something, and the people who remember why.

**Repetition is the mechanism. Memory is the product.**

So this document is about the things the club does over and over, and how the
platform can hold onto them without asking a volunteer for a single extra minute.

---

## One thing I will not do in this document

I know the club's data. I do not know the club's habits.

I know Tithe Farm, the yellow and green, the £2 for under-16s, the Lane numbers
and the hearts. I know that Broadfields United share the ground, so some of our
away games are played at home — and that somebody already wrote *"a derby in the
truest sense; same pitch, same changing rooms, different dugout."*

**I do not know what happens at the final whistle. I do not know who opens up on
a Saturday morning, or what gets said in the changing room before a cup tie, or
which song, if any, gets sung.**

I could invent those. It would read beautifully and it would be a lie — and the
one habit that makes this club genuinely hard to copy is that it *refuses to
state what it doesn't know*. `venues.json` is verified or empty. The fixture
importer fails an entire season rather than guess a kick-off time. `llms.txt`
publishes a list of things nobody may claim about the club.

**That discipline applies to this document too.**

So below, every ritual is marked:
- **【known】** — evidenced in the club's own data or code
- **【ask】** — every club has this; I don't know *your* version, and somebody
  should write it down before the person who knows it stops coming
- **【propose】** — doesn't exist yet; worth starting

The **【ask】** list is the most valuable thing in this document. It is a list of
things that currently live in three or four people's heads.

---

# Part 1 · The cultural assets

The things that make someone say *"that's just how we do things here."*
Documented, because undocumented culture is one bereavement away from gone.

### 1. We do not make things up 【known】
The strongest cultural trait the club has, and it's visible in the code.
A comment in the fixture importer explains that scores are *not* auto-imported
because the club cannot yet prove which side's goals appear first — *"guessing
that orientation would publish a defeat as a win."* Somebody chose to be slower
and right.

**This is the club's actual competitive advantage.** Any club can buy a website.
Almost none will refuse to publish something they aren't sure of.

### 2. We sound like ourselves 【known】
*"A DIVISION UP. SO WHAT."* — the FA Cup tie away to a club a division above.
*"THE AWAY DAY THAT ISN'T"* — Broadfields, at our own ground.
*"THE WAIT IS OVER"* — the first league game of the season.
*"Ball's gone over the fence."* — the 404 page.

Nobody briefed those. They are the club talking. **The voice is a cultural asset
with a named custodian, and it should never be handed to a tool that averages it
out.**

### 3. We are a members' section, not a landlord 【known】
Rayners Lane FC is a fully integrated members' section of Tithe Farm Sports &
Social Club Ltd. That is not a footnote — it shapes everything: the bar, the
groundshare, who unlocks the gate, whose committee decides what. A future
chairman needs to understand that relationship before they understand anything
else.

### 4. Floodlights are not a detail here 【known】
**In 1994 the club was relegated from the Hellenic Premier Division because
Tithe Farm had no floodlights — not on playing record.**

That is the single most important sentence in the club's history and it is
currently one line on a timeline. Relegated for want of infrastructure, having
earned the right to stay up. Every ground improvement, every fundraising push,
every argument about spending money on the facility instead of the team traces
back to it.

**Every club has a wound like this. Most forget it within a generation.**
This one should be told properly, once, and then referenced whenever the club
spends money on the ground.

### 5. Everyone's welcome is a policy, not a slogan 【known】
The festive templates in the graphics tool cover Christmas, Eid, Diwali,
Vaisakhi, Hanukkah, Lunar New Year and Remembrance. Somebody sat down and made
sure the whole of Harrow was in there. The community partner is an inclusive
fitness trainer working with all abilities. Under-10s get in free.

That's a club that has decided who it is for. **Say it out loud more often.**

### 6. We do the unglamorous thing properly 【known】
Verified venue addresses so that away directions actually work. A season guard
that refuses the wrong year's fixtures. Contrast tokens raised so older
supporters can read the site. An empty state that says *"No hearts yet — show
your card at the gate and the club adds a…"*

**Somebody cared about an empty state.** That is the culture.

---

# Part 2 · The ritual calendar

Every recurring moment worth keeping, what the platform should do, and — the only
question that matters — **what it costs a volunteer.**

The rule throughout: **the platform prompts, the human answers in one sentence,
the platform does the rest.** If a ritual needs a form, it will not survive
February.

---

## Pre-season

### Fixture release day 【known】
The first genuinely emotional day of the year and currently a silent data import.
Forty-two fixtures land in a JSON file and nothing happens.

**What it should do.** The day fixtures are confirmed: one graphic per month
(the tool already makes these), the first "who we've got" post, the away-day
travel notes, and the opening-day countdown starts. **Volunteer cost: approve
four things.** Everything derives from the import that already happened.

### First training session 【ask】
Who runs it, where, what's said. Nobody photographs it and it's the first time
that year's squad is in one place.
**Platform:** one prompt — *"First session back. Take one wide photograph."*
That single image is the cover of the season's archive.

### Media day 【propose】
The club has 24 players, 18 photographs, 0 bios, 0 squad numbers.
**One afternoon fixes all of it, permanently.** Portraits, a squad photograph,
and two questions per player:
> *"Three words your team-mates would use about you."*
> *"The game you'll never forget."*

**Volunteer cost: one afternoon, once a year.** It feeds the squad page, 24
profiles, the sponsorship pitch, every graphic, the programme and the archive.
This is the highest-value ritual in the document and it requires no software at
all.

### Shirt launch 【ask】
Acerbis supply the kit. McCafferty's are on the away shirt; Hanlon Dry Lining on
the home. **A shirt launch is the single best commercial content moment of the
year and I can see no evidence one happens.**
**Platform:** a shirt-reveal template, sponsors named in the post, and the shirt
photographed on an actual player at the actual ground — not a product shot.

### Captain announcement 【ask】
**Platform:** one card, one line from the manager about why. Stored on the
player's profile permanently — *"Captain, 2026-27."* In fifteen years that list
is one of the most-read pages on the site.

---

## Season launch

### The first home game 【known — 1 August 2026, Wallingford & Crowmarsh】
The club already knows what to say: **"THE WAIT IS OVER."**

**What it should do.** The homepage acknowledges it's opening day — not a
gimmick, a fact. Gate prices, first-timer directions, and afterwards the first
result, first goalscorer and first attendance of the season all recorded as
firsts, because in twenty years "first goal of the 2026-27 season" is a real
question somebody will ask.
**Volunteer cost: nil beyond the normal matchday capture.**

### Derby week 【known — Broadfields United, 4 August】
Already written: *"same pitch, same changing rooms, different dugout."*
**Platform:** the fixture card carries the angle; the week gets its own graphic;
the result goes into a permanent head-to-head record that grows every season.
**Volunteer cost: nil — the writing already exists in `opponents.json`.**

---

## The campaign

### Every matchday 【known, partly】
The spine of everything. Currently the loop doesn't close — a friendly from
4 July is still marked "scheduled" 23 days later, and two matches reported in the
news don't exist in the fixture list at all.

**The ritual:** brief before, capture after. Score, scorers, man of the match,
attendance, ten photographs, three sentences.
**Volunteer cost: five minutes after full time.** Everything else — the report
draft, the graphic, the gallery, the stats, the archive entry — comes from it.

### Player debut 【propose】
Currently invisible. A debut is a permanent fact about a person's life.
**Platform:** the first time a name appears in a line-up, mark it. *"Debut."*
On the player's profile forever. **Cost: nil — it's derived.**

### First goal 【propose】
Same. Derived from the capture, marked automatically, kept forever.

### Milestones 【propose】
50th appearance. 100th. First hat-trick. **The platform should notice these and
tell the media volunteer**, because nobody counts appearances by hand and so
these moments currently pass unmarked. A 100-appearance man at a Step 5 club has
given the best part of a decade. He should get a graphic and a mention.

### Cup runs 【known — FA Cup EP, FA Vase 1Q】
*"A DIVISION UP. SO WHAT."* is already written for London Lions away.
**Platform:** a cup run is a *story*, not a series of fixtures — round by round,
kept together, with the 1992-93 second qualifying round as the mark to beat. If
this club ever goes past it, that page should already exist and be waiting.

### Signings 【known】
The tool already makes signing graphics.
**Add the ritual around it:** a signing gets a profile, a squad number, a
photograph and an app account *before* the announcement goes out — not weeks
after. A player whose page is live on day one tells other players.

---

## Festive football

### The Christmas message 【ask】
**Platform:** the templates exist for Christmas, Eid, Diwali, Vaisakhi, Hanukkah,
Lunar New Year and Remembrance. What's missing is the *habit* of a message from
the chairman with them. **Cost: four sentences, ten times a year.** Ten years of
those is a genuine record of what the club was thinking.

### Remembrance 【known】
The poppy template exists. **Whatever the club does at the ground on the nearest
Saturday should be photographed every single year, without exception.**

---

## The run-in

### Squad availability and the volunteer squeeze 【ask】
March and April are when volunteers burn out and nobody records that it happened.
**Platform:** nothing clever. Just make sure the tools ask for *less* in the run-in,
not more — the matchday capture should still take five minutes in April.

---

## End of season

### Presentation evening 【ask】
Player of the Year, Players' Player, Clubman of the Year, Young Player.
**These lists are the club's honours board and I can find no trace of them.**

**Platform:** a permanent awards page, one row per season, going back as far as
anyone can remember. **Ask the older members to fill in the past ones before that
becomes impossible** — this is the single most urgent archival job in the club
and it has nothing to do with software.

### Volunteer appreciation 【propose】
Football clubs thank players constantly and volunteers almost never.
**Platform:** one page listing who did what this season — the photographer, the
programme, the gate, the bar, the pitch. Named. Every season. In twenty years
that page is the club's real history.

### The season archive 【propose】
At the final whistle of the last game, the season closes: every fixture, result,
scorer, photograph, programme, report and award sealed into one page —
`/2026-27`. Then the next season starts clean.

**This is the single most important feature in the entire plan** and it is
mostly a by-product of doing the matchday capture properly. Twenty of those
pages is a football club's life.

---

## Off-season

### Ground work 【known — see cultural asset 4】
The groundsman's summer is invisible and this club, of all clubs, was relegated
once for want of floodlights.
**Platform:** photograph the ground in July every year. Same spot, same angle.
Twenty of those images side by side tells a story of a club looking after itself
that no words could.

---

# Part 3 · What disappears if people leave

Honestly assessed. This is the part of the document a chairman should re-read
annually.

| If this person stopped tomorrow | What is lost |
|---|---|
| **The person who built the platform** | Almost everything. 9,129 lines of `admin.html`, 57 functions, and an excellent set of explanatory comments that **do not ship** — `.gitignore` excludes them. A new engineer inherits a 97-line README claiming "no dependencies" while the browser loads seven CDN libraries. **This is the club's largest single risk and it is not a software problem.** |
| **The secretary / welfare officer** | The same person holds both roles. Every safeguarding relationship, every league contact, every deadline. **One person, two of the club's most load-bearing jobs.** |
| **The manager** | Selection reasoning, player relationships, and every match storyline — which are written into the programme and printed once. |
| **The media volunteer** | The voice. The graphics standard. Which photographs exist and where. Everything in §1.2. |
| **The chairman** | The sponsor relationships. `sponsors.json` records a name, a tier and a logo — **no value, no term, no renewal date, no owner.** Who agreed what, with whom, and when it's due, is in one head. |
| **The oldest member** | 1982. 1994. Who scored, who played, who ran the line. **This is the one that is already being lost, right now, and no software can recover it.** |

**Three jobs, this season, ranked by irreversibility:**
1. **Sit down with the longest-serving members and record the honours, the
   awards and the stories.** Not a project. A phone and an afternoon.
2. **Write down who owns what**, so no role is a single point of failure.
3. **Make the sponsor agreements a record instead of a memory.**

None of the three is engineering.

---

# Part 4 · Seasonal cadence

The site should know where the club is in its year. Not through gimmicks —
through relevance. The data to do all of this already exists.

| Phase | What the club is feeling | What the platform leads with |
|---|---|---|
| **June–July** | Rebuilding | Fixture release, media day, shirt launch, season tickets, early-bird deadline |
| **First week of August** | *The wait is over* | Opening day. Gate prices. Directions for first-timers. Countdown |
| **August–October** | Momentum forming | Form, cup rounds, new signings settling, debuts |
| **November–December** | Grind | Remembrance, festive messages, volunteer thanks, ground conditions |
| **January–February** | Cold, thin crowds | Loyalty. Who's turned up to everything. Hearts and Lane numbers earn their keep |
| **March–April** | The run-in | Position, run-in fixtures, what's still to play for. **Ask less of volunteers** |
| **May** | It's done | Awards, season archive sealed, volunteer appreciation, thank-yous |

**One rule: the homepage should never be identical in January and August.**
Not because it's redesigned — because the club isn't in the same place, and a
site that looks the same all year is a noticeboard, not a club.

---

# Part 5 · What a volunteer inherits in 2036

Someone joins the committee ten years from now. This is what should be waiting.

**A complete archive.** Ten sealed seasons. Every fixture, result, scorer,
photograph, programme and award. They can answer *"when did we last beat
Broadfields?"* without asking anyone.

**A voice they can hear.** Ten years of match reports, chairman's messages and
graphics in one consistent tone. They will know how the club sounds before
anybody explains it, because they'll have read it.

**A standard they can meet.** Written down: how many photographs per game, what a
match report contains, how a signing is announced, what we never publish unless
we're sure. Not aspiration — **the actual standard, with examples.**

**A process they can run on their second Saturday.** Six one-page runbooks in
club language. Run a matchday. Publish news. Add a fixture. Add a sponsor. Add a
player. Fix a bad save.

**The people who came before.** Every volunteer named, every season. The
photographer in 2027. Whoever did the gate in 2031. **This is the part almost
every club loses, and it is free to keep.**

**A club that is honest about what it doesn't know.** Gaps marked as gaps. No
invented attendances, no rounded-up honours. If 1974 is missing, it says so.

**And the thing they should not inherit:** a system only one person understands.

---

# The fifty-year question

> *If Rayners Lane FC folded in fifty years and historians opened this platform —
> would they find a website, or the story of a football club?*

**Today, honestly: a website.**

They would find an unusually good one. They would learn the club was founded in
1933, plays at Tithe Farm in yellow and green, won the Hellenic Division One in
1982 and reached the Second Qualifying Round of the FA Cup in 1992-93. They would
find the fixtures for 2026-27 and a well-written note explaining that Broadfields
United share the ground.

And then it would stop.

They would find **twenty-four players and not one sentence about any of them.**
They would find a gallery of **cartoon illustrations captioned "Midfield Magic"**.
They would find a friendly played on the 4th of July with no score. They would
find that the club's own newsroom said *"this Saturday"* about a match that had
already happened. They would not learn what the club's Player of the Year was
called in any season. They would not see a single face.

They would conclude, reasonably, that this was a club that built something
impressive and then didn't have time to fill it in.

**That is fixable, and almost none of the fix is software.**

Take the photographs. Ask the two questions. Record the result within two hours.
Name the volunteers. Write down the awards before the people who remember them
are gone. Seal each season and start the next one clean.

Do that for three years and the answer changes permanently — because by then the
archive is deep enough that nobody would dare stop.

**The platform's job is not to be impressive. It is to make the right habit
easier than the wrong one, every Saturday, for fifty years.**

Everything in `ROADMAP.md` should be judged on whether it does that.

---

*Up the Lane.*
