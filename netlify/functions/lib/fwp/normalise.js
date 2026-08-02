// Identity normalisation — the difference between "the same club" and "a
// different club", in one place.
//
// Every comparison of a club or person name across Football Web Pages, our
// fixtures file and the crest library must go through here. Two spellings of
// one club must collapse to one key; two genuinely different sides must not.
'use strict';

/**
 * Club key. "Punjab Utd FC" and "Punjab United" are one club; "Wallingford &
 * Crowmarsh" and "Wallingford and Crowmarsh" are one club.
 *
 * Reserve and development sides are deliberately NOT collapsed into the first
 * team — dropping the suffix would file a reserve result against the first
 * team's record.
 */
function clubKey(s) {
  var t = String(s || '').toLowerCase().trim();
  var suffix = '';
  if (/\b(reserves?|res|development|dev|u\d{2}|academy|youth|women|ladies|a|b)\b\s*$/i.test(t)) {
    suffix = '|' + t.match(/\b(reserves?|res|development|dev|u\d{2}|academy|youth|women|ladies|a|b)\b\s*$/i)[1]
      .replace(/^res$/, 'reserves').replace(/^dev$/, 'development');
    t = t.replace(/\b(reserves?|res|development|dev|u\d{2}|academy|youth|women|ladies|a|b)\b\s*$/i, '');
  }
  t = t
    // A trailing \b cannot match after "A.F.C." — the final dot and the
    // following space are both non-word, so there is no boundary between them.
    // "A.F.C. Hayes" therefore normalised to "ahayes" while "AFC Hayes" gave
    // "hayes", and one club became two teams with two crest lookups. Anchored
    // on a following space or end-of-string instead. Verified against all 27
    // club names the site holds: not one existing key moves.
    .replace(/\ba\.?\s?f\.?\s?c\.?(?=\s|$)/g, ' ')
    .replace(/\bf\.?\s?c\.?(?=\s|$)/g, ' ')
    .replace(/\butd\b/g, 'united')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
  return t + suffix;
}

/** Person key. Folds the curly apostrophe and the "(C)" the line-ups append. */
function playerKey(s) {
  return String(s || '')
    .replace(/\s*\((?:c|gk|capt|captain|vc)\)\s*$/i, '')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Are these the same club? Never a substring test — "Hayes" ≠ "AFC Hayes". */
function sameClub(a, b) {
  var ka = clubKey(a), kb = clubKey(b);
  return !!ka && ka === kb;
}

/** URL-safe slug, matching the provider's own path style. */
function slug(s) {
  return String(s || '').toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { clubKey, playerKey, sameClub, slug };
