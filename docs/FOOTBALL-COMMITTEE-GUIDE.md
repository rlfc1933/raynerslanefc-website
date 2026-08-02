# The football system — what it does, and the four things it needs from you

Written for whoever is on the committee, not for whoever built it. If a
sentence here needs explaining, that is a fault in the sentence.

---

## What happens without anybody doing anything

Football Web Pages publishes the league's own record of our matches. The site
reads it and keeps itself up to date:

| Every | What |
|---|---|
| minute | the live score, the clock, goals, cards, substitutions, full time |
| 20 minutes | the fixture list, the league table, team sheets, player records |
| hour | the matchday programme |

So on a Saturday afternoon **nobody has to touch anything**. The score on the
home page moves by itself. When the match finishes, the result stays up for 24
hours and then the countdown to the next game takes over.

Appearances, goals and minutes are worked out from the matches themselves. They
are not typed in and they are not counted up — they are recalculated from
scratch every twenty minutes, so if the league corrects a scorer three weeks
later, our numbers correct themselves too.

---

## The four things it needs from a person

### 1. Naming our players — Match Day → **Player records**

This is the only one that matters regularly.

Football Web Pages gives us names as text on a team sheet. The system will not
guess which of our players a name belongs to, because getting it wrong is
silent: nothing breaks, no warning appears, and a player just quietly ends up
with somebody else's goals.

So it shows you the names it does not recognise and waits. For each one you
either pick who it is from our squad list, or say it is not one of ours.

**You will see opposition names in the count too.** That is normal and needs
nothing from you — we only name our own players.

Once a player is named, his page appears and his record starts filling in from
every match he has played, including ones before you named him.

If you say "not one of ours", it will not ask you about that name again.

Every decision is signed with your name and kept permanently. That is not
suspicion — it is so that in two years somebody can ask "who decided this was
that player?" and get an answer.

### 2. Optional programme content — Match Day → **Matchday programme**

The programme builds itself and publishes itself on matchday once both official
team sheets are out. Anything you add — a manager's note, a feature, a photo —
makes it richer. Adding nothing does not stop it appearing.

### 3. Watching the health box — Match Day → **Football system**

One line at the top tells you whether everything is running. If something has
stopped, it says which part and how long it has been that way.

- **Working** — nothing to do.
- **Nothing to do yet** — running, but there has been no match to report on.
- **Has stopped updating** — it worked before and has not lately. Worth a look.
- **Failing** — its last attempt failed, and the exact error is shown.

### 4. The emergency scoreboard — only when the feed is wrong

Folded away at the bottom of Match Day, in red, behind **"Emergency: enter the
score by hand"**.

If you ever need it:

1. **First** press **Take manual control** in the live updates box at the top.
2. *Then* enter the score.

If you skip step 1, the next automatic check will overwrite what you typed and
it will look as though your entry never saved. That is the single most
confusing thing this system can do to you, which is why it is written on the
panel itself.

When the game is over, hand it back to automatic.

---

## Questions you might reasonably ask

**A player's page says he has no minutes.** Then we do not know them. Minutes
need both ends of his match on record — when he came on, when he came off. If
one is missing the figure is left out rather than guessed. His appearances and
goals are still right.

**Two players at different clubs have the same name.** They stay two people.
The system will never merge across clubs, and if you ever genuinely need to, it
makes you say so explicitly.

**Somebody's goal is wrong.** It can be corrected, and a correction outranks
the automatic recalculation from then on — the next sync will not undo it.

**A name on a team sheet is not a link.** Then nobody has named that player
yet. The name still shows, because leaving it off would misrepresent the match.

**Do we pay for any of this?** No. Football Web Pages publish the league's
results and confirmed that we may use their feed. We credit them wherever their
data appears.

---

## What the system will never do

- Guess which player a name belongs to.
- Merge two records because the names look similar.
- Show a number it cannot support. It shows nothing, and says nothing is known.
- Rewrite an archived programme. What was published stays published.
- Give a player a page before a person has confirmed who he is.
