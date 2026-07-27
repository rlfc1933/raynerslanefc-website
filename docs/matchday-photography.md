# Matchday Photography — the standard

One page. Read it once, then take your phone to the game.

**Why we do this:** in fifty years someone will open this website and try to work
out what Rayners Lane FC was. Right now they'd find a fixture list. The
photographs are the difference between a website and a football club's story.

Every Saturday not photographed is gone. That's the only thing on the club's
plan that gets more expensive the longer we leave it.

---

## The job

**Ten usable photographs per home game. Your name on them. That's it.**

Not a hundred. Ten good ones beat a hundred nobody has time to look through.

A phone is fine. Every photograph in this archive will outlive the camera that
took it, and nobody in 2076 will care what it was shot on.

---

## The ten

Get these and you've done the job. Anything else is a bonus.

| # | Shot | Why it matters |
|---|---|---|
| 1 | **The ground before anyone arrives** | Same spot, same angle, every game. Twenty of these side by side is the club looking after itself |
| 2 | **The teams coming out** | The only moment the whole squad is together |
| 3 | **Two or three action shots** | Any action. Blurry and real beats sharp and staged |
| 4 | **A goal celebration** — ours | If we score, turn to the players, not the ball |
| 5 | **The bench / the manager** | Gary on the touchline is half the story of a season |
| 6 | **The supporters** | Even if it's eleven people and a dog. *Especially* then |
| 7 | **The volunteers working** | Gate, bar, programme, linesman. Almost no club photographs these people |
| 8 | **A sponsor board with something happening in front of it** | This is what we send them. Worth more than the logo on its own |
| 9 | **One close portrait of a player** | Wide shots don't build connection. Faces do |
| 10 | **The final whistle** | Won, lost or drawn. Record both — a club that only photographs wins is lying |

---

## Rules

**Landscape unless there's a reason.** The site, the programme and the graphics
are all wider than they are tall.

**Don't delete the near-misses on the day.** Send everything. Sorting is quick;
re-taking is impossible.

**Faces of under-18s: check first.** If a child is identifiable and you're not
sure, ask the Welfare Officer before it goes anywhere. If in doubt, don't.
We'd rather lose a photograph than get this wrong.

**Never a stock image. Never a generated graphic in the gallery.** The gallery is
photographs of things that actually happened. Graphics belong in Post Studio.

**Don't edit heavily.** Straighten it, brighten it, leave it alone.

---

## Getting them onto the site

### A whole match — the normal case
**Send the folder to whoever runs the site. Don't upload them one at a time.**

They run one command:

```bash
node tools-archive-match.js \
  --fixture fwp-578225 \
  --from ~/Desktop/lane-photos \
  --credit "Your Name"
```

That resizes everything, files it under the fixture, credits you, and commits
**once**. Ten photographs uploaded one at a time through the portal is ten
separate saves — and on the free plan, that's real cost for no benefit.

Add `--dry-run` first if you want to see what it will do without it doing
anything.

### One photograph
Portal → **Gallery** → caption, category, **photographer**, upload, save.
It resizes in your browser before it saves. It will not let you add a photograph
without a name against it — that's deliberate.

---

## Where they end up

```
img/matchday/2026-27/2026-08-01-wallingford-and-crowmarsh/
    2026-08-01-wallingford-and-crowmarsh-01.jpg     ← 1600px, for the site
    2026-08-01-wallingford-and-crowmarsh-01.webp    ← smaller, modern browsers
    2026-08-01-wallingford-and-crowmarsh-01-thumb.jpg
    2026-08-01-wallingford-and-crowmarsh-01-thumb.webp
```

Season folder, then date and opponent, then a numbered file. You can find any
photograph from any game without opening a database, and so will whoever is
doing this job in 2046. That's the whole point of the naming.

---

## If you can't make a game

**Say so in the week, not on the day.** Someone else takes the phone. A game
photographed badly is worth more than a game not photographed.

---

## Done well, this looks like

- Ten photographs, every home game, all season
- A name against every one of them
- The gallery is a record of this club, not a set of illustrations
- In May, the season's page is full of things that actually happened

*Up the Lane.*
