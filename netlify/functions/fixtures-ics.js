// Rayners Lane FC — subscribable calendar feed (ICS).
// Turns the club-controlled season schedule (data/fixtures.json) into a
// standard iCalendar feed so fans can subscribe in Apple/Google/Outlook and
// have it update automatically whenever staff edit a fixture in the admin.
//
//   Subscribe (auto-updating):  webcal://raynerslanefc.co.uk/.netlify/functions/fixtures-ics
//   Download (one-off import):  https://raynerslanefc.co.uk/.netlify/functions/fixtures-ics

const RLFC = 'Rayners Lane FC';

function pad(n) { return String(n).padStart(2, '0'); }

// Build a floating local-time stamp "YYYYMMDDTHHMMSS" from date + HH:MM.
// Floating (no TZID/Z) is the most compatible for a single-timezone UK club
// and sidesteps DST conversion bugs.
function stamp(date, time) {
  var t = (time || '15:00').slice(0, 5);
  return date.replace(/-/g, '') + 'T' + t.replace(':', '') + '00';
}
function endStamp(date, time) {
  var hh = parseInt((time || '15:00').slice(0, 2), 10);
  var mm = (time || '15:00').slice(3, 5);
  var end = Math.min(hh + 2, 23); // +2h, clamped to keep it same-day
  return date.replace(/-/g, '') + 'T' + pad(end) + mm + '00';
}
function ics(text) { return String(text == null ? '' : text).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }

function fold(line) {
  // RFC5545: lines should not exceed 75 octets — fold with CRLF + space.
  if (line.length <= 73) return line;
  var out = '', i = 0;
  while (i < line.length) { out += (i ? '\r\n ' : '') + line.slice(i, i + 73); i += 73; }
  return out;
}

exports.handler = async function (event) {
  var base = process.env.URL || ('https://' + (event.headers && event.headers.host || 'raynerslanefc.co.uk'));
  var fixtures = [];
  try {
    var r = await fetch(base + '/data/fixtures.json', { signal: AbortSignal.timeout(6000) });
    if (r.ok) { var d = await r.json(); fixtures = (d && d.fixtures) || []; }
  } catch (e) {}

  var dtstamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '').replace(/(\d{8}T\d{6})Z/, '$1Z');

  var lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rayners Lane FC//Fixtures//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Rayners Lane FC Fixtures', 'X-WR-TIMEZONE:Europe/London',
  ];

  fixtures.forEach(function (f) {
    if (!f.date) return;
    var home = f.isHome !== false ? RLFC + ' vs ' + (f.opponent || 'TBC') : (f.opponent || 'TBC') + ' vs ' + RLFC;
    var played = f.us != null && f.them != null;
    var summary = (played ? 'FT ' + f.us + '-' + f.them + ': ' : '') + home;
    var desc = (f.competition || '') + (played && f.scorers ? ' — ' + f.scorers : '');
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + (f.id || (f.date + '-' + (f.opponent || 'tbc')).replace(/\s+/g, '')) + '@raynerslanefc.co.uk');
    lines.push('DTSTAMP:' + dtstamp);
    lines.push('DTSTART:' + stamp(f.date, f.kickoff));
    lines.push('DTEND:' + endStamp(f.date, f.kickoff));
    lines.push(fold('SUMMARY:' + ics(summary)));
    if (f.venue) lines.push(fold('LOCATION:' + ics(f.venue)));
    if (desc) lines.push(fold('DESCRIPTION:' + ics(desc)));
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="rayners-lane-fixtures.ics"',
      'Cache-Control': 'public, max-age=900',
      'Access-Control-Allow-Origin': '*',
    },
    body: lines.join('\r\n'),
  };
};
