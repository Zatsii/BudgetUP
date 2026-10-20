// Turns a speech transcript like "coffee twelve dollars", "lunch twelve euros" or "groceries 45.50"
// into an amount (cents) and a description. The currency word is only used to find the amount. Pure function: no React Native imports, tested with node --test.

export type ParsedVoiceExpense = {
  amountCents: number | null;
  description: string;
  transcript: string;
};

const ONES: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000 };
// Main-unit currency words: they mark where the amount is, then are dropped. Which currency was
// said isn't kept (amounts are plain numbers).
const CURRENCY_WORDS = new Set([
  'dollar', 'dollars', 'buck', 'bucks', 'usd', 'euro', 'euros', 'eur', 'pound', 'pounds', 'quid', 'gbp',
  'franc', 'francs', 'chf', 'rupee', 'rupees', 'rs', 'inr', 'yen', 'peso', 'pesos', 'dirham', 'dirhams',
  'riyal', 'riyals', 'krona', 'kronor', 'krone', 'kroner', 'zloty', 'rand',
]);
const CENT_WORDS = new Set(['cent', 'cents', 'penny', 'pence', 'paise', 'rappen', 'centimes']);
// Words dropped from the edges of the description ("spent 12 dollars ON coffee").
const FILLER = new Set(['i', 'spent', 'paid', 'pay', 'add', 'for', 'on', 'of', 'at', 'a', 'an', 'the', 'and', 'expense', 'was', 'it']);

type Token = { raw: string; word: string };

function tokenize(transcript: string): Token[] {
  return transcript
    .toLowerCase()
    // "$12.50" / "€12.50" -> "12.50 dollars" so symbols and words share one path
    .replace(/[$€£₹¥]\s*(\d+(?:[.,]\d+)?)/g, ' $1 dollars ')
    .replace(/(\d),(\d{3})/g, '$1$2') // thousands separators
    .replace(/(\d)\s*-\s*(?=[a-z])/g, '$1 ')
    .replace(/(?<=[a-z])-(?=[a-z])/g, ' ') // "forty-five"
    .split(/\s+/)
    .map((raw) => ({ raw, word: raw.replace(/[^a-z0-9.]/g, '').replace(/\.$/, '') }))
    .filter((t) => t.word.length > 0);
}

const isNumericWord = (w: string) =>
  w in ONES || w in TENS || w in SCALES || /^\d+(\.\d+)?$/.test(w) || w === 'point';

/**
 * Parses a run of number words/digits into separate number groups. A new group starts when a
 * word can't extend the current number, so "forty five fifty" -> [45, 50] and "twelve fifty" -> [12, 50].
 * "point" switches to decimal digits: "twelve point five zero" -> [12.5].
 */
function parseNumberGroups(words: string[]): number[] {
  const groups: number[] = [];
  let total = 0; // committed thousands
  let current = 0; // value below 1000
  let has = false;
  let lastKind: 'none' | 'ones' | 'teen' | 'tens' | 'scale' = 'none';
  let decimal: string | null = null;

  const flush = () => {
    if (has) groups.push(total + current + (decimal ? Number(`0.${decimal}`) : 0));
    total = 0; current = 0; has = false; lastKind = 'none'; decimal = null;
  };

  for (const w of words) {
    if (decimal !== null) {
      if (w in ONES && ONES[w] < 10) { decimal += String(ONES[w]); continue; }
      if (/^\d+$/.test(w)) { decimal += w; continue; }
      if (w in TENS || w in ONES) { decimal += String(TENS[w] ?? ONES[w]).padStart(2, '0'); continue; }
      flush();
    }
    if (w === 'point') {
      if (has) decimal = '';
      continue;
    }
    if (/^\d+(\.\d+)?$/.test(w)) {
      if (has) flush();
      const n = Number(w);
      groups.push(n);
      continue;
    }
    if (w in SCALES) {
      const scale = SCALES[w];
      if (!has) { current = 1; has = true; }
      if (scale === 1000) { total += (current || 1) * 1000; current = 0; }
      else current = (current || 1) * 100;
      lastKind = 'scale';
      continue;
    }
    if (w in TENS) {
      if (lastKind === 'ones' || lastKind === 'teen' || lastKind === 'tens') flush();
      current += TENS[w]; has = true; lastKind = 'tens';
      continue;
    }
    if (w in ONES) {
      const n = ONES[w];
      const kind = n >= 10 ? 'teen' : 'ones';
      if (lastKind === 'ones' || lastKind === 'teen' || (lastKind === 'tens' && n >= 10)) flush();
      current += n; has = true; lastKind = kind;
    }
  }
  flush();
  return groups;
}

/** Converts number groups (plus whether currency/"cents" words split them) into cents. */
function groupsToCents(before: number[], after: number[], sawCents: boolean): number | null {
  // "12 dollars and 50 cents" / "12 dollars 50"
  if (before.length > 0 && after.length > 0) {
    const cents = after[0];
    if (Number.isInteger(cents) && cents < 100) return Math.round(before[0] * 100) + cents;
    return Math.round(before[0] * 100);
  }
  const groups = before.length > 0 ? before : after;
  if (groups.length === 0) return null;
  if (sawCents && groups.length === 1 && before.length === 0) return Math.round(groups[0]); // "75 cents"
  // "twelve fifty" / "forty five fifty" -> dollars + cents
  if (groups.length >= 2 && Number.isInteger(groups[0]) && Number.isInteger(groups[1]) && groups[1] < 100) {
    return groups[0] * 100 + groups[1];
  }
  return Math.round(groups[0] * 100);
}

export function parseVoiceExpense(transcript: string): ParsedVoiceExpense {
  const tokens = tokenize(transcript);

  // Find the first span of number-ish tokens, letting currency words, "and", "cents" and "a" glue parts together.
  let start = -1;
  let end = -1;
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i].word;
    const startsNumber =
      isNumericWord(w) && w !== 'point' ||
      // "a dollar fifty", "a hundred bucks"
      ((w === 'a' || w === 'an') && i + 1 < tokens.length && (tokens[i + 1].word in SCALES || CURRENCY_WORDS.has(tokens[i + 1].word)));
    if (!startsNumber) continue;
    start = i;
    end = i;
    for (let j = i + 1; j < tokens.length; j++) {
      const v = tokens[j].word;
      const glue = v === 'and' || CURRENCY_WORDS.has(v) || CENT_WORDS.has(v);
      if (isNumericWord(v) || glue) end = j;
      else break;
    }
    // Don't swallow a trailing "and" that belongs to the description.
    while (end > start && tokens[end].word === 'and') end--;
    break;
  }

  if (start === -1) {
    return { amountCents: null, description: cleanDescription(tokens.map((t) => t.raw)), transcript };
  }

  const span = tokens.slice(start, end + 1).map((t) => (t.word === 'a' || t.word === 'an' ? 'one' : t.word));
  const dollarIdx = span.findIndex((w) => CURRENCY_WORDS.has(w));
  const sawCents = span.some((w) => CENT_WORDS.has(w));
  const numbersOnly = (ws: string[]) => ws.filter((w) => w !== 'and' && !CURRENCY_WORDS.has(w) && !CENT_WORDS.has(w));

  let amountCents: number | null;
  if (dollarIdx >= 0) {
    amountCents = groupsToCents(
      parseNumberGroups(numbersOnly(span.slice(0, dollarIdx))),
      parseNumberGroups(numbersOnly(span.slice(dollarIdx + 1))),
      sawCents,
    );
  } else {
    amountCents = groupsToCents([], parseNumberGroups(numbersOnly(span)), sawCents);
  }
  if (amountCents !== null && (!Number.isFinite(amountCents) || amountCents <= 0)) amountCents = null;

  const rest = [...tokens.slice(0, start), ...tokens.slice(end + 1)].map((t) => t.raw);
  return { amountCents, description: cleanDescription(rest), transcript };
}

function cleanDescription(words: string[]): string {
  const ws = words.map((w) => w.replace(/[^\p{L}\p{N}'&-]/gu, '')).filter(Boolean);
  while (ws.length && FILLER.has(ws[0].toLowerCase())) ws.shift();
  while (ws.length && FILLER.has(ws[ws.length - 1].toLowerCase())) ws.pop();
  const text = ws.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
