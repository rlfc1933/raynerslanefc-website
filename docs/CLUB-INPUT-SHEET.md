# Club Input Sheet — everything we need from you, in one go

**Who fills this in:** any committee member or the media volunteer.
**How long:** about 40 minutes, plus one training session for the player bit.
**You do not need to understand the website.** Fill in the tables, send the
photos, done.

**One rule, and it is the whole point:**

> **If you don't know something, write `UNKNOWN`. Never guess.**
>
> A blank is fine. A guess ends up on the website, in a graphic, in the
> programme and in what Google and ChatGPT tell people about Rayners Lane — and
> we can't tell later which bits were guessed.

Every field is marked **REQUIRED**, **OPTIONAL**, or **LEAVE BLANK IF UNKNOWN**.

---

## 1 · Missing matches

Three games are referred to on the website but aren't in the fixture list, so
the site currently can't show them at all.

| # | What we know | What's missing |
|---|---|---|
| 1 | **Hayes & Yeading United**, Sat 4 July, home, pre-season friendly | **No score.** The website has said "Result to follow" for 23 days |
| 2 | **Metropolitan Police**, Sat 25 July, away, Imber Court — from the news article | **The whole fixture and the result** |
| 3 | **Aylesbury United** — the article says "another pre-season win, Tuesday night" | **Everything.** We don't even know the date |

### Fill this in

Copy the block below once per match. **Three blocks needed.**

```
MATCH 1
  Opponent .................. REQUIRED
  Date (YYYY-MM-DD) ......... REQUIRED
  Competition ............... REQUIRED   e.g. Pre-Season Friendly
  Home or Away .............. REQUIRED   H / A
  Venue ..................... REQUIRED   ground name
  Kick-off (24h, e.g 15:00).. REQUIRED
  Final score US-THEM ....... REQUIRED   e.g. 2-1  (our goals first)
  Half-time score ........... LEAVE BLANK IF UNKNOWN
  Goalscorers ............... LEAVE BLANK IF UNKNOWN   name (minute), comma separated
  Attendance ................ LEAVE BLANK IF UNKNOWN   ONLY if officially counted — see note
  How do you know? .......... REQUIRED   see "Source" below
  Date you checked it ....... REQUIRED   YYYY-MM-DD
```

**Source** — one of:
`Club records` · `Manager/coach confirmed` · `Match report` ·
`Football Web Pages` · `League website` · `Opposition website` · `Other (say what)`

**Attendance — read this.** The club has never published an attendance figure,
and `llms.txt` currently tells AI assistants exactly that. **Only give a number
if someone actually counted on the gate and the club is happy for it to be
public.** A remembered estimate is a guess. Leave it blank otherwise — blank is
completely fine and costs us nothing.

---

## 2 · Old articles still saying "this Saturday"

Three articles talk about games that have already been played. They're still
live and one is still the featured story on the newsroom.

**Pick ONE option per article.** Nothing gets rewritten without you choosing.

| Article | Published | Problem | Your decision |
|---|---|---|---|
| *One more before it's real: The Lane face Met Police…* | 23 Jul | Says "this Saturday" — that Saturday was 25 July. **Currently the featured story.** | |
| *THE LANE AT METROPOLITAN POLICE FC* | 23 Jul | Same match, same problem | |
| *THE WAIT IS OVER* (Wallingford preview) | 27 Jul | Correct **until 1 Aug**, then stale | |

**Options — write A, B, C or D:**

- **A · Archive unchanged.** Stays readable at its own URL, drops out of the
  newsroom list. *Nothing is deleted.* Honest — it was true when written.
- **B · Rewrite retrospectively.** Change "this Saturday" to the actual date and
  add the result. **You must supply the new wording.**
- **C · Replace with a match report.** Best option if you have something to say
  about the game. **You must supply the report.**
- **D · Just remove from featured.** Article stays exactly as-is in the list.

**Recommendation if you're unsure: A for the two Met Police articles, and D
plus a note in the diary to archive the Wallingford one after 1 August.**

---

## 3 · Matchday — the next game

This drives the live scoreboard, the countdown, the programme and the graphics.
It is currently still set to **Cockfosters (18 July)**.

```
NEXT MATCH
  Opponent .................. REQUIRED
  Competition ............... REQUIRED
  Date (YYYY-MM-DD) ......... REQUIRED
  Kick-off (24h) ............ REQUIRED
  Home or Away .............. REQUIRED
  Venue ..................... REQUIRED
  Admission — has it changed from £9 / £6 / £2 / U10s free?  REQUIRED  YES / NO
    If YES, new prices ...... .....................................
  Programme ready? .......... REQUIRED   YES / NO / NOT DOING ONE
  Who runs the scoreboard? .. REQUIRED   name + mobile
  Who takes the photos? ..... REQUIRED   name  (see docs/matchday-photography.md)
  Who writes the report? .... OPTIONAL
  Sponsor to feature ........ OPTIONAL   which partner gets the shout-out
```

---

## 4 · The squad — the big one

**This is the most valuable thing on the list and the only one that needs the
players themselves.** Right now: **0 of 24 have a squad number, 0 have a bio,
6 have no photograph.**

Do it at one training session. Two questions each, about 30 seconds a player.

### Copy this into a spreadsheet — one row per player

```csv
Name,SquadNumber,Position,ThreeWords,GameNeverForget,Nickname,ShortBio,PlayerSponsor,ConsentGiven
```

| Column | | Notes |
|---|---|---|
| `Name` | **REQUIRED** | Exactly as they want it shown |
| `SquadNumber` | **REQUIRED** | **Do not guess.** If numbers aren't allocated yet, write `UNKNOWN` for everyone and send it when they are. Two players cannot share one |
| `Position` | **REQUIRED** | Goalkeeper / Defender / Midfielder / Forward |
| `ThreeWords` | **REQUIRED** | *"Three words your team-mates would use about you."* Their words, not yours |
| `GameNeverForget` | **REQUIRED** | *"The game you'll never forget."* One or two sentences |
| `Nickname` | OPTIONAL | Only if they're happy for it to be public |
| `ShortBio` | OPTIONAL | Leave blank — we build it from the two answers |
| `PlayerSponsor` | LEAVE BLANK IF UNKNOWN | Business or person sponsoring them |
| `ConsentGiven` | **REQUIRED** | `YES` / `NO`. Anything without `YES` is not published |

**Consent matters.** These are real people and their words go on a public page
that search engines and AI assistants read. If a player says no, we publish the
name, number, position and photo only — that's a perfectly good profile.

### Photographs

**Missing for these six:** Carl Adiku · Joshua Andrews · Badou Faye ·
Nathan Kpemou · Jamie Pitt · Alvin Walters

- Head and shoulders, plain background, looking at the camera
- Phone is fine. Landscape or portrait both work
- Name each file after the player: `carl-adiku.jpg`
- **REQUIRED** for those six · a fresh set for all 24 is better

---

## 5 · Acerbis artwork

The kit partner's logo file doesn't exist, so the site shows the word
**ACERBIS** in club type instead. That works, but it isn't their brand.

Ask your Acerbis contact for:

| | |
|---|---|
| Logo file | **REQUIRED** — SVG preferred, or transparent PNG at least 1000px wide |
| Wordmark version | OPTIONAL — if they have one for dark backgrounds |
| Usage restrictions | **REQUIRED** — anything we must or must not do. If none, write `NONE` |
| Website URL | **REQUIRED** — where their logo should link |
| Exact partner title | **REQUIRED** — we currently say *"Official Kit Partner"*. Is that right? |

---

## 6 · Cup draws

The season ticket covers the **Combined Counties League Cup** and the
**Middlesex Senior Cup**. Neither draw has been made, and the fixtures page now
says exactly that rather than looking broken.

**Nothing to do today.** When a draw is published, send:

```
CUP DRAW
  Competition ............... REQUIRED
  Round ..................... REQUIRED
  Opponent .................. REQUIRED
  Date ...................... REQUIRED or "TO BE CONFIRMED"
  Home or Away .............. REQUIRED or "TO BE CONFIRMED"
  Venue ..................... REQUIRED or "TO BE CONFIRMED"
  Kick-off .................. REQUIRED or "TO BE CONFIRMED"
  Where did you see it? ..... REQUIRED
```

"TO BE CONFIRMED" is a real answer and the site displays it properly.

---

## Send it back

1. This sheet, filled in
2. The squad spreadsheet
3. Player photographs (a folder or a link)
4. Acerbis artwork
5. Any matchday photographs you already have

Everything arrives as **one batch** — one update, one deployment, one check.

**Anything you leave blank stays honestly blank on the website.** Nothing is
invented to fill a gap. That refusal is the reason people can trust what the
club publishes, and it's worth protecting.

*Up the Lane.*
