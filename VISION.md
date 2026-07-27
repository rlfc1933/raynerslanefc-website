# Rayners Lane FC — Product Vision

**Head of Product · 27 July 2026 · v1.0**
The constitution. Read before the roadmap. If this is right, the roadmap is obvious.

---

## 1 · First, a challenge to the brief

You said you think we're building *"a complete operating system for a modern
grassroots football club."*

**Half right, and the wrong half is load-bearing.**

"Operating system" is a software framing. Follow it honestly and it leads
somewhere specific: multi-tenancy, configurability, other clubs' badges, a
support inbox. That path is available — most grassroots platforms are worse than
this one — and taking it early would destroy the thing that makes this good,
because an operating system has to be *generic* and Rayners Lane's entire
advantage is that it is *specific*.

Here's what I think is actually true:

> **We are building the club's memory and its voice. The operating system is how
> a volunteer-run club sustains that without burning out.**

The OS is the means. The memory is the end.

That distinction decides real things. Under "we're building an OS", the
Boardroom tools are a gap to fill. Under "we're building memory and voice", they
are seven tiles competing for volunteer attention with a workflow that has never
run once — and the right answer is to remove them, not finish them.

Everything below follows from the second framing.

---

## 2 · What Rayners Lane becomes in three years

Not features. What is *true* about the club in July 2029 that isn't true today.

**The club remembers itself.**
Today the club's history ends in 2026 and its present is barely recorded — 0 of
24 players have a bio, 9 of 12 gallery items are cartoons, and the manager's
match storylines are typed into a programme, printed once for forty people, and
lost. In three years there are three seasons of photographs, team sheets, match
reports, player interviews and programmes, searchable, attributed to the
volunteers who made them. **That archive is the asset.** Not the website — the
archive.

**The club has a voice that carries further than its results.**
It already has this and doesn't know how much it's worth. "A DIVISION UP. SO
WHAT." is not a headline a template produces. In three years that voice is
consistent across the website, the graphics, the programme, the app and the
answers AI assistants give about the club — because the club decided early to be
the most accurate source about itself and never fabricated anything.

**Running the club takes less time than it does now, not more.**
This is the hardest one and the easiest to fail. Every feature added is a
maintenance liability against a fixed volunteer budget. In three years a
volunteer does *less* software work per match than today — one brief instead of
five re-entries — and spends the time saved on people.

**The club is worth sponsoring for reasons a sponsor can see.**
Not "we have a website". A local business sees named supporters, real
photographs, a player they can put their name to, and a monthly note showing
what their money did. Renewals become a calendar entry, not an act of goodwill.

**Players want to be here.**
A signing gets a profile with their words in it, a squad number, a photograph, an
app that tells them where to be — on day one. Players tell other players. At Step
5, recruitment is the entire competitive lever, and identity is what makes a
player choose you over a club paying the same.

**Other clubs ask how.**
They copy the screens and find it doesn't work, because what they copied was the
output of a process they don't have.

---

## 3 · How each person should describe us

Not what they see. What they'd *say*, unprompted.

| Who | What they should say |
|---|---|
| **First-time supporter** | *"I only wanted the kick-off time and I ended up reading about the club for ten minutes."* |
| **Weekly volunteer** | *"It does the boring bit. I write one thing and it turns up in five places."* |
| **Manager on a Friday** | *"Everything I need is on one screen and it already knows who we're playing."* |
| **New player** | *"They had my picture up and my name on a shirt number before my first training session."* |
| **Parent** | *"They told me who the welfare officer was before I had to ask."* |
| **Sponsor** | *"They send me something every month showing what my name is doing. Nobody else does that."* |
| **Another club** | *"How does a Step 5 club do this with volunteers? What are we missing?"* |
| **Committee** | *"We spend less time on admin than we did five years ago, and we know more about the club than we ever have."* |

If a change doesn't move one of those sentences closer to true, it isn't a
priority.

---

## 4 · Product principles

The constitution. Ten. Each one earned from something I actually found.

**1. We publish what is true, or we publish nothing.**
`import-fixtures.js` refuses to guess a kick-off time and refuses to auto-import
scores because it can't yet prove which side's goals come first.
`venues.json` is "verified or empty". `llms.txt` publishes a list of things AI
must *not* say about the club. This discipline already exists and it is the
club's most valuable engineering habit. **It now applies to the interface too:
no success message before the thing has succeeded.**

**2. One input, many outputs. Never type the same fact twice.**
A fixture is currently identified five separate times to prepare one match.
Eleven editorial fields reach only a printer. Any feature that adds a sixth place
to type the opponent's name is rejected on sight.

**3. Volunteer attention is the scarcest resource in the club.**
Not money, not engineering time. Attention. Every feature spends it. A feature
that saves ten minutes a week is worth more than a feature that impresses.
**Corollary: shipping a tool nobody opens is not neutral — it's a tax.**

**4. The club's voice is a product asset and is not negotiable.**
Copy is not decoration. If a change makes the platform sound more like software
and less like a football club, it is a regression regardless of its metrics.

**5. Every feature must survive its author leaving.**
The single greatest risk here is key-person dependency. If only one person can
operate or maintain something, it is not finished.

**6. Content is infrastructure.**
A player bio isn't marketing — it's the substrate that makes the profile page,
the sponsorship pitch, the graphic, the programme feature and the search result
possible. Empty content is a broken system, not an incomplete nice-to-have.

**7. The archive outranks the interface.**
Given a choice between a better-looking page and a better-recorded season,
record the season. Design decays; the archive appreciates.

**8. Specificity over polish.**
"Wallingford share our ground, so this is a derby in the truest sense" beats any
amount of visual refinement. When in doubt, be more specific about *this* club.

**9. Fail visibly, recover easily.**
A volunteer will hit failure on a Saturday. What matters is whether they can
tell, and whether they can fix it. Silent failure is the worst outcome available
and is never an acceptable trade for a cleaner interface.

**10. Build for Rayners Lane. If it generalises, that's a bonus, never a goal.**
The moment we design for "clubs like us", we start removing the things that make
us us.

---

## 5 · The ecosystem

One club, three surfaces, one spine.

```
                        ┌──────────────────────────────┐
                        │        THE CLUB RECORD        │
                        │  fixtures · players · people  │
                        │  sponsors · venues · content  │
                        │  photographs · results        │
                        └───────────┬──────────────────┘
                                    │  one fact, one home
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐          ┌────────────────┐          ┌────────────────┐
│ PUBLIC FACE   │          │  THE WORKSHOP  │          │  THE SQUAD     │
│ website       │          │  staff portal  │          │  Lane App      │
│ programme     │          │  Marketing     │          │ availability   │
│ answer engines│          │  Studio        │          │ selection      │
└───────────────┘          └────────────────┘          └────────────────┘
   "who we are"              "how we run it"             "where to be"
```

**Three products, three audiences, one record. Nothing owns a fact twice.**

### How information should flow

| Moment | Input | Flows to |
|---|---|---|
| Fixture list published | One import | Website · app · programme · graphics · calendar · schema |
| Match brief written | One form, before the game | Fixture card · preview · graphics · programme · squad broadcast |
| Player joins | One profile | Squad · profile page · app account · sponsorship · graphics · schema |
| Match played | One capture, after | Result · report · gallery · graphics · momentum · player stats |
| Sponsor signs | One record | Website · programme · graphics · renewal calendar · monthly value note |
| Photograph taken | One upload | Gallery · article · profile · graphics · archive |

### The three that don't exist yet, and what to do about them

**Academy, Women's team, Community projects.** The programme editor already has
`academy`, `womens` and `community` fields — collected, printed, never surfaced.

**My position: do not build sections for teams that don't exist yet.** Build the
*record* so that the day a women's team is formed, it inherits fixtures, squad,
profiles, graphics and a programme with no new code. Structure first, pages when
there's something real to put in them. An empty "Academy" page is worse than no
page — it advertises a gap.

---

## 6 · What cannot be copied

The most important section. If a club cloned every screen tomorrow, here is what
they'd still be missing.

### 1. The refusal to make things up
This is the deepest and least obvious advantage. The codebase contains a
consistent, documented discipline of *declining to state what isn't known* —
venues verified or blank, fixtures that fail the whole import on one season
mismatch, an `llms.txt` section listing what AI must not claim, a comment
explaining why scores are not auto-imported. **That is a culture, expressed as
code.** A competitor can copy the file and not the habit, and within a season
their data will be wrong and ours won't. Accuracy compounds; sloppiness
compounds faster.

### 2. The voice
"A DIVISION UP. SO WHAT." · "THE AWAY DAY THAT ISN'T" · "Ball's gone over the
fence." · "The club would rather be described as unknown than described
wrongly." · "No hearts yet — show your card at the gate and the club adds a…"

That last one is an *empty state*. Somebody cared about an empty state. You
cannot brief this, buy it, or generate it. It took years.

### 3. Ninety years, and a club that has decided to record the next three
Heritage can't be cloned and an archive can't be back-filled. The clubs copying
this in 2027 will start their archive in 2027. We'll be three seasons ahead,
permanently, and the gap widens every Saturday.

### 4. The people, and how they work
A volunteer who photographs every home game. A manager who writes storylines. A
committee that will fill in bios if asked properly. **The platform is a
multiplier on that behaviour, not a substitute for it** — which is exactly why
the gallery is 75% cartoons today: the software was ready and the process wasn't.

### 5. Being the only source that's certain about itself
The club has quietly taken the position of being the definitive answer to "who
are Rayners Lane FC?" for AI assistants. Being early and being accurate compound
together. A club starting in 2028 is arguing with three years of our facts.

### 6. Consistency
Same typeface, same yellow, same voice, on the website, the graphics, the
programme and the app. Most grassroots clubs have four different visual
identities depending on who made the post. Consistency reads as competence, and
competence is what a sponsor is buying.

**None of the six is code.** Which is the point, and the reason the roadmap
leads with content and process rather than engineering.

---

## 7 · Challenging my own roadmap

Ruthlessly, as asked.

### Genuinely moves us toward the vision
| Item | Why it's non-negotiable |
|---|---|
| **IW-1 Player content** | Unblocks squad, profiles, sponsorship, graphics, schema. Free. Nothing else has this leverage |
| **S-6 Matchday photography** | Starts the archive. Every week not doing it is permanently lost |
| **S-2 The Match Brief** | The one structural bet. Turns writing-once-publishing-once into the ecosystem |
| **Truthfulness fixes** | Principle 1 and 9. Trust compounds; so does its absence |
| **IW-4 Volunteer language** | Principle 3. Hours of work, permanent comprehension gain |
| **E-1 Matchday capture** | Closes the loop. Without it the archive doesn't self-fill |

### Nice ideas that can wait
- **S-7 Momentum surface** — lovely, genuinely wanted, but it's a *presentation*
  of data we're not yet capturing reliably. Comes after E-1, not before.
- **E-5 Season rollover** — real pain, but annual. One bad afternoon a year is
  survivable; do it in the close season.
- **R-X4 dead space** — craft, not value. Last.

### Remove
- **Boardroom / Meetings / Wins / SWOT / Income planning.** Three empty data
  files, never used once, seven dashboard tiles. Under Principle 3 this isn't
  neutral, it's a tax. **Remove from the dashboard. Run one meeting through them
  before spending another hour.** If that meeting isn't logged, retire them.
- **Sponsor Radar extension.** Discovery was never the bottleneck. Freeze it.
- **V-3 platform-for-other-clubs.** Under Principle 10 this is the most dangerous
  idea in the roadmap. Not "later" — **off the plan until 2028 at the earliest.**
- **Stats engine, unless E-1 ships.** Four unused tables and 24 players showing
  0/0/0. Either earn the numbers or stop displaying them.

### If time and budget were halved, I'd fight for exactly three
1. **Player content and matchday photography.** Not code. Starts the archive,
   makes the club feel human, unblocks the commercial case. If we do nothing else
   for a year, do this.
2. **The Match Brief.** The single structural change that makes every future
   piece of content cheaper. Without it we're adding features to a system that
   still types the opponent's name five times.
3. **Honest status.** Every place the platform reports success it hasn't
   verified. Not because it's a defect — because Principle 1 is the club's
   actual advantage and an interface that lies corrodes it from the inside.

Everything else I would drop without much argument.

---

## 8 · The two risks that would end this

Stated plainly, because a vision that ignores them is decoration.

**Key-person dependency.** This platform is understood in depth by very few
people, possibly one. The inline comments are excellent and almost none of them
ship. If that person stops, the club inherits 9,129 lines of `admin.html` and a
97-line README. **Principle 5 exists because of this risk, and it is the one I'd
watch hardest.**

**Adding software faster than volunteers.** Thirty-eight tools, five of which are
documents, seven of which serve a workflow that has never run. Every addition
spends attention the club doesn't have. The vision only works if the platform
gets *simpler to operate* as it gets more capable — which means removal is a
feature, and the roadmap must retire things, not only add them.

---

## 9 · The statement

> ## **Rayners Lane FC exists to give a corner of Harrow something to belong to — and this platform exists so that ninety years of that is remembered, told in the club's own voice, and run by volunteers who spend their time on people instead of paperwork.**

### How to use it

Three questions for any future request. All three must pass.

1. **Does it help the club remember, or help it tell its story?**
2. **Does it give a volunteer time back — or at minimum, not take any?**
3. **Would it still be true and specific to Rayners Lane if another club copied it?**

If the answer to any is no, the honest response is *"not yet"* — and sometimes
*"never"*, which is a legitimate product decision and one this platform has not
made often enough.

---

*Next: re-cut `ROADMAP.md` against this. Several items don't survive the filter,
which is the point of writing this first.*
