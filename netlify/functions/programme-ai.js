// ════════════════════════════════════════════════════════════════════════════
// PROGRAMME EDITORIAL HELP — the club's facts, written up.
//
// THE ONE RULE
// ------------
//   Full-Time tells us what happened. Our store records it. AI helps Russell
//   write about it.
//
// Every number in this file comes from the club's own store, is assembled
// HERE, and is passed to the model as a finished list of facts. The model is
// asked for sentences, never for football. It is told, in terms, that it may
// not add a fact — and because the facts are computed before the call, there
// is nothing it could add them to.
//
// WHY THE FACTS ARE ASSEMBLED SERVER-SIDE
// ---------------------------------------
// If the browser posted the facts, anybody could post different ones and the
// programme would print whatever they claimed, with the club's name on it. The
// caller names a player and a mode; the numbers are looked up here.
//
// WHAT IT WILL NOT DO
// -------------------
// If the store has nothing to say about somebody, this refuses rather than
// writing around the gap. A paragraph about a player we have no record of is
// exactly the sort of plausible invention that ends up in print — an age, a
// former club, a goal that never happened. The honest answer is that there
// isn't enough yet.
//
// Output is always a DRAFT. It is returned to the editor and appears nowhere
// until a human saves the programme.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const adminOk = require('./lib/pin');
const RP = require('./lib/football/read-players');
const S = require('./lib/football/store');

const SEASON = process.env.FWP_SEASON || '2026-2027';

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(obj),
  };
}

/** Nothing to write about is a legitimate answer, and the only honest one. */
const NOT_ENOUGH = {
  ok: false,
  insufficient: true,
  error: "There isn't enough verified club information yet to write this accurately.",
};

// ── THE FACTS ───────────────────────────────────────────────────────────────

/** One player's verified season record. Numbers only, from our own store. */
async function playerFacts(clubPlayerId, season) {
  const all = await RP.statsByClubPlayer(season, 'all');
  const t = all[String(clubPlayerId)];
  if (!t) return null;
  // Somebody with no recorded involvement gives a writer nothing to work with.
  if (!t.appearances) return null;
  return {
    appearances: t.appearances,
    starts: t.starts,
    substituteAppearances: t.substituteAppearances,
    goals: t.goals,
    minutes: t.minutesKnown ? t.minutes : null,
    yellowCards: t.yellowCards,
    redCards: t.redCards,
  };
}

/** The club's recent official results, most recent first. */
async function recentResults(season, limit) {
  const rows = await S.rest('football_fixtures?season=eq.' + encodeURIComponent(season) +
    '&fixture_status=eq.played&select=scheduled_kickoff_at,home_score,away_score,' +
    'home_team_id,away_team_id&order=scheduled_kickoff_at.desc&limit=' + (limit || 5)) || [];
  return rows;
}

/**
 * The list of facts handed to the model, as plain English lines. Written out
 * rather than passed as JSON so the prompt reads as a brief, and so anything
 * absent is simply not mentioned instead of arriving as a null the model might
 * try to fill.
 */
function factLines(mode, subject, facts) {
  const L = [];
  if (mode === 'spotlight') {
    L.push('Player: ' + subject.name);
    if (subject.position) L.push('Position: ' + subject.position);
    L.push('Appearances this season: ' + facts.appearances);
    if (facts.starts != null) L.push('Of those, starts: ' + facts.starts);
    if (facts.substituteAppearances) L.push('Substitute appearances: ' + facts.substituteAppearances);
    L.push('Goals this season: ' + facts.goals);
    if (facts.minutes != null) L.push('Minutes played (approximate): ' + facts.minutes);
  }
  return L;
}

// ── THE MODEL ───────────────────────────────────────────────────────────────

const SYSTEM = [
  'You write short paragraphs for the Rayners Lane FC matchday programme. The club is a Step 5 non-league side founded in 1933, playing in the Combined Counties Premier Division North. The tone is warm, plain and proud — a club programme, not a newspaper and not marketing copy.',
  '',
  'YOU ARE GIVEN A COMPLETE LIST OF FACTS. Write using those facts and nothing else.',
  '',
  'You must NOT state, imply or guess: a player\'s age, nationality, birthplace, previous clubs, career history, injuries, awards, contract, personality, or any goal, assist, match event or statistic that is not in the list. If the list does not mention something, it does not exist for the purposes of what you are writing.',
  '',
  'Do not invent quotes. Do not predict results. Do not describe moments from matches. Do not round, adjust or restate the numbers differently — if the list says 2 appearances, write 2.',
  '',
  'Write British English. Two to four sentences. No headings, no bullet points, no markdown, no emoji, no hashtags. Plain sentences a committee member would be happy to print.',
].join('\n');

async function generate(prompt) {
  const groq = process.env.GROQ_API_KEY;
  const gem = process.env.GEMINI_API_KEY;
  const body = SYSTEM + '\n\nFACTS:\n' + prompt + '\n\nWrite the paragraph.';

  if (groq) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + groq, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        temperature: 0.4,           // low: this is reportage, not invention
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: 'FACTS:\n' + prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json().catch(() => null);
    return (j && j.choices && j.choices[0] && j.choices[0].message.content) || null;
  }
  if (gem) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' +
      model + ':generateContent?key=' + gem, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: body }] }],
        generationConfig: { temperature: 0.4 },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json().catch(() => null);
    return (j && j.candidates && j.candidates[0] &&
      j.candidates[0].content.parts.map((p) => p.text).join('')) || null;
  }
  return null;
}

// ── HANDLER ─────────────────────────────────────────────────────────────────

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  if (!adminOk(b.pin)) return resp(401, { ok: false, error: 'Unauthorized' });

  const mode = String(b.mode || '').trim();
  const season = b.season || SEASON;

  try {
    if (mode === 'spotlight') {
      const id = String(b.clubPlayerId || '').trim();
      if (!id) return resp(400, { ok: false, error: 'Choose a player.' });
      const facts = await playerFacts(id, season);
      if (!facts) return resp(200, NOT_ENOUGH);

      const lines = factLines('spotlight', { name: b.name, position: b.position }, facts);
      const text = await generate(lines.join('\n'));
      if (!text) return resp(200, { ok: false, error: 'The writing assistant is not available right now.' });

      return resp(200, {
        ok: true,
        draft: true,                       // never published by this call
        text: String(text).trim(),
        // Shown to the editor so the basis of the paragraph is visible.
        basis: 'Based on official match data: ' + facts.appearances +
          ' appearance' + (facts.appearances === 1 ? '' : 's') +
          ', ' + facts.goals + ' goal' + (facts.goals === 1 ? '' : 's') + '.',
        facts: facts,
      });
    }

    if (mode === 'form') {
      const rows = await recentResults(season, 5);
      if (!rows.length) return resp(200, NOT_ENOUGH);
      const lines = ['Rayners Lane recent official results, most recent first:'];
      rows.forEach((r) => {
        if (r.home_score == null || r.away_score == null) return;
        lines.push('  ' + String(r.scheduled_kickoff_at || '').slice(0, 10) +
          ' — ' + r.home_score + '-' + r.away_score);
      });
      if (lines.length === 1) return resp(200, NOT_ENOUGH);
      const text = await generate(lines.join('\n'));
      if (!text) return resp(200, { ok: false, error: 'The writing assistant is not available right now.' });
      return resp(200, {
        ok: true, draft: true, text: String(text).trim(),
        basis: "Based on Rayners Lane's last " + (lines.length - 1) + ' recorded results.',
      });
    }

    return resp(400, { ok: false, error: 'bad-mode' });
  } catch (e) {
    console.error('[programme-ai]', (e && e.message) || e);
    return resp(200, { ok: false, error: 'That could not be written just now.' });
  }
};

exports._internal = { factLines, NOT_ENOUGH, SYSTEM, playerFacts };
