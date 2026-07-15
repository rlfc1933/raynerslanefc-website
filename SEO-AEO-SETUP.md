# Rayners Lane FC — SEO / AEO: what's done, and what only you can do

The code side is finished and live. This file is the part that needs a human with
logins. None of it is difficult; most of it is one-off; together it's worth more
than everything in the codebase, because **backlinks and Wikidata are what carry
an entity beyond your own website.**

Work through it top to bottom. It's ordered by value, not effort.

---

## The strategy in one paragraph

Rayners Lane will never out-rank the football internet on volume, and chasing
that would be a waste of everyone's Saturday. What the club *can* own is being
the single cleanest, most factual, most machine-readable source **about itself**
— so that when anyone, anywhere, asks Google or ChatGPT or Perplexity "who are
Rayners Lane?", "what league are they in?", "where do they play?", the answer
comes from the club and is right. That's an *entity* problem, not a keyword
problem. Everything below builds the entity.

---

## 1. Google Search Console — 10 minutes, do this first

Nothing else is measurable until this exists.

1. Go to https://search.google.com/search-console → **Add property** → **Domain** → `raynerslanefc.co.uk`
2. It gives you a **TXT record**. Add it wherever the domain's DNS lives (likely Netlify → Domains → DNS, or your registrar). Verify.
3. **Sitemaps** → submit `sitemap.xml`
4. **URL Inspection** → paste `https://raynerslanefc.co.uk/` → **Request indexing**. Do the same for `/fixtures.html`, `/squad.html`, `/about.html`, `/history.html`.

Then leave it a fortnight and look at **Performance**. The queries people actually
use to find the club will tell you more than any guess.

## 2. Bing Webmaster Tools — 5 minutes

https://www.bing.com/webmasters — you can **import straight from Search Console**,
which does it in two clicks. Worth it purely because **Bing's index feeds
ChatGPT and Copilot**. Skipping Bing means skipping a chunk of the AI audience.

## 3. Wikidata — the big one, ~30 minutes

**This is what lets Google and the AI engines build a knowledge panel and cite
the club internationally.** Without it, the club is a website. With it, the club
is an *entity* that machines can reason about.

1. Create an account at https://www.wikidata.org
2. **Search first** — check nobody's already made an item for Rayners Lane FC.
3. **Create a new item.** Label: `Rayners Lane F.C.` Description:
   `association football club in Harrow, England`
4. Add these statements. **Every one of these is verified from the club's own
   records — do not add anything else without a source:**

   | Property | Value |
   |---|---|
   | instance of (P31) | association football club |
   | sport (P641) | association football |
   | inception (P571) | 1933 |
   | country (P17) | United Kingdom |
   | located in (P131) | London Borough of Harrow |
   | home venue (P115) | Tithe Farm Sports & Social Club |
   | coordinate location (P625) | 51.570435, -0.365073 |
   | league (P118) | Combined Counties Football League |
   | official website (P856) | https://raynerslanefc.co.uk |
   | X/Twitter username (P2002) | RaynersLaneFC |
   | Instagram username (P2003) | raynerslanefc |
   | YouTube channel ID (P2397) | UCN6SkwSIRK86x9Wk0AFoydA |

5. Add `https://raynerslanefc.co.uk` as the **reference** on the statements.
6. **Then tell me the Q-number** (e.g. `Q12345678`). I'll add it to the club's
   `sameAs` and to `llms.txt`, which closes the loop: the website points at
   Wikidata, Wikidata points at the website, and the entity becomes unambiguous.

> Wikidata is stricter about notability than Wikipedia is lenient. A 90-year-old
> club that has played in the FA Cup and won a league title is a reasonable case.
> If it's declined, don't fight it — revisit after some press coverage.

## 4. Backlinks — the slow, unglamorous, decisive one

Search and AI both work on *corroboration*. One site saying Rayners Lane was
founded in 1933 is a claim. Five independent sites agreeing makes it a fact.

Ask for a link to `https://raynerslanefc.co.uk` from:

- [ ] **Combined Counties League** — club directory. Ask the league secretary. Highest value: it's the authority for your division.
- [ ] **Middlesex FA** — club listing
- [ ] **FA Full-Time** — club page
- [ ] **Football Web Pages** — they already carry your fixtures; ask them to link the site
- [ ] **Pitchero** — link back from your own Pitchero page (you control this one — do it today)
- [ ] **Groundhopper sites** — Football Ground Map, Pyramid Passion, Non-League Matters. They *want* ground info. Send them the address, coordinates and a photo of Tithe Farm.
- [ ] **Harrow Times / Harrow Online** — local press
- [ ] **Non-League Daily / The Non-League Football Paper** — the angle below
- [ ] **Tithe Farm Sports & Social Club** — the parent club's own site
- [ ] **Your sponsors** — Hanlon Dry Lining, McCafferty's, Ashwood, You-Nique. You link to them; ask each to link back. Easiest wins on this list.

### The story that gets you covered

Don't pitch "we have a new website" — nobody cares. Pitch the thing that's
actually true and actually unusual:

> *A Step 5 club in Harrow has built a digital setup most League Two clubs don't
> have: a player app, live match-day scoring, automated fixture sync, an AI-ready
> knowledge base, and directions to all 19 away grounds — run entirely by
> volunteers, for nothing.*

That's a real story, it's verifiable, and it's the kind of thing non-league press
and football-tech people share. It's also the Wrexham-adjacent angle — small club,
big ambition — without claiming to be Wrexham.

## 5. Keep it fresh — the only ongoing job

AI engines weight *current* sources. This is already wired; just use it:

- Enter scores on match day (admin → Match Day)
- Publish a match report (admin → Match Report)
- Keep the next fixture right (admin → **Next Match**, top of the dashboard)

Every one of those updates `dateModified` and the sitemap automatically. **A club
that posts weekly beats a club that posted once, every time.**

## 6. When facts change, tell me

`llms.txt` and `llms-full.txt` are the club's brief to every AI on earth. They're
accurate today. They go stale the moment something changes and nobody says so.

Tell me when: a new chairman or manager, a league change, a new honour, a ground
move, a new social account. It's a two-minute change and it keeps the AI answers
right.

---

## What I deliberately did NOT do

- **No machine translation.** A Step 5 Harrow club has no real Arabic or German
  search demand, and auto-translated pages actively hurt. `hreflang` is set to
  `en-GB` / `x-default`, which is the honest answer. Your international audience
  is diaspora, groundhoppers and story-seekers — they read English, and they'll
  arrive via AI answers and social, not via a translated microsite.
- **No invented facts.** No capacity, no phone number, no honours beyond the two
  the club records (Hellenic Division One 1982, FA Cup 2Q 1992-93), no
  attendance. If you want any of those in the schema and in AI answers, send me
  the real number and I'll add it. A wrong fact gets repeated everywhere and is
  close to impossible to retract — that's why the gaps are gaps.
- **No Wikidata item created.** It needs an account and a human who can vouch for
  the club. Instructions are above; it's the highest-value item on this page.

## Things I found while doing this that you should know

1. **Two wrong facts were already live.** The homepage FAQ told Google and every
   AI that *Jenny Pitt is Club Secretary* — she's Matchday Secretary; Emma
   Galloway is Club Secretary. Fixed.
2. **The club's own ground coordinate was ~800m wrong**, and marked "verified".
   It was also hardcoded in The Lane App, so players navigating to a **home**
   game were sent half a mile away. Fixed everywhere to `51.570435, -0.365073`.
3. **The address is written two ways** across the site — "Tithe Farm Sports &
   Social Club" (25×) and "Tithe Farm Social Club" (8×). Machines read those as
   two different places. The schema and `llms.txt` now use the long form
   consistently; the remaining prose could be normalised when someone's passing.
4. **`DARREN NUGENT` is in caps** in the committee data and duplicates Russell
   Nugent's Programme Editor role, and **"Tony  Pratt"** has a double space.
   Cosmetic, but the committee page is a page Google reads.
