// Supporter mobile numbers — normalised once, so one person is one number.
//
// WHY A LIBRARY AND NOT A REGULAR EXPRESSION
// ------------------------------------------
// "07400 123456", "+447400123456", "0044 7400 123456" and "07400123456" are
// the same phone. A regex that strips spaces gets three of those right and the
// fourth wrong, and the club ends up with the same supporter stored twice under
// numbers that look different. Phone numbering is also full of rules nobody
// guesses correctly — 07700 900xxx, for instance, is Ofcom's reserved range for
// drama and fiction, and is not a real phone anybody can answer.
//
// libphonenumber-js (MIT, pinned) is Google's numbering metadata. This file is
// the only place it is used, and it is used for exactly two things: produce a
// comparable E.164 value, and say whether a number could exist.
//
// WHAT IT DOES NOT DO
// -------------------
// Nothing here contacts a validation service. A supporter's number is not sent
// anywhere to be "enriched" or checked — it is parsed locally against published
// numbering rules, and that is all.
'use strict';

const { parsePhoneNumberFromString } = require('libphonenumber-js');

// The club is in Harrow. A supporter typing "07400 123456" means a UK number,
// and asking them to prefix +44 to join a football club would be silly.
const DEFAULT_COUNTRY = 'GB';

/**
 * @param {string} raw   what the supporter typed
 * @param {string} [country]  ISO-2, defaults to GB
 * @returns {{ok:boolean, e164?:string, country?:string, type?:string, reason?:string}}
 */
function normalise(raw, country) {
  const input = String(raw == null ? '' : raw).trim();
  if (!input) return { ok: false, reason: 'empty' };
  if (input.length > 32) return { ok: false, reason: 'too long' };

  let parsed;
  try {
    parsed = parsePhoneNumberFromString(input, (country || DEFAULT_COUNTRY).toUpperCase());
  } catch (e) {
    return { ok: false, reason: 'unparseable' };
  }
  if (!parsed || !parsed.isValid()) return { ok: false, reason: 'not a valid number' };

  let type = null;
  try { type = parsed.getType() || null; } catch (e) { /* metadata gap; not fatal */ }

  return {
    ok: true,
    e164: parsed.number,          // +447400123456
    country: parsed.country || null,
    type: type,                   // MOBILE / FIXED_LINE / …
  };
}

/**
 * Is this number one a WhatsApp message could ever reach?
 *
 * Only advisory. A supporter who gives a landline has not done anything wrong,
 * and the club should not refuse their number — but the club also should not
 * count them towards a WhatsApp launch that could never include them.
 */
function couldReceiveWhatsApp(result) {
  if (!result || !result.ok) return false;
  // Some regions have no type metadata; treat unknown as possible rather than
  // telling a supporter their real number is wrong.
  return result.type === null || result.type === 'MOBILE' || result.type === 'FIXED_LINE_OR_MOBILE';
}

/**
 * For staff eyes, never for a general activity feed.
 * "+447400123456" → "+44 74•• ••3456"
 */
function mask(e164) {
  const s = String(e164 || '');
  if (s.length < 7) return '••••';
  return s.slice(0, 5) + '•• ••' + s.slice(-4);
}

module.exports = { normalise, couldReceiveWhatsApp, mask, DEFAULT_COUNTRY };
