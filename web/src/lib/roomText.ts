// Pure helpers for presenting room text and terrain.

const TERRAIN_ICONS: [RegExp, string][] = [
  [/city|town|street|road|path/, 'location_city'],
  [/inside|indoor|room|hall|temple|shop/, 'meeting_room'],
  [/forest|wood|jungle/, 'forest'],
  [/field|plain|grass/, 'grass'],
  [/hill/, 'landscape'],
  [/mountain|peak/, 'terrain'],
  [/water|river|swim|ocean|sea|lake|underwater/, 'water'],
  [/desert|sand/, 'wb_sunny'],
  [/air|sky|cloud/, 'air'],
  [/cave|underground|tunnel|dungeon/, 'dark_mode'],
  [/swamp|marsh/, 'grain'],
  [/ice|snow|tundra/, 'ac_unit'],
  [/fire|lava/, 'local_fire_department'],
];
export const terrainIcon = (t = '') => TERRAIN_ICONS.find(([re]) => re.test(t.toLowerCase()))?.[1] ?? 'radio_button_unchecked';

const TERRAIN_TINTS: [RegExp, string][] = [
  [/forest|wood|jungle|field|grass|swamp/, '#42a17d'],
  [/water|river|ocean|sea|lake/, '#3f7fb8'],
  [/ice|snow/, '#9fc5d9'],
  [/fire|lava|desert/, '#d4574a'],
  [/cave|underground|dungeon/, '#6b4fa0'],
];
export const terrainTint = (t = '') => TERRAIN_TINTS.find(([re]) => re.test(t.toLowerCase()))?.[1] ?? '#d97707';

const ARTICLES = new Set(['a', 'an', 'the', 'some', 'several', 'two', 'three', 'four', 'many', 'few', 'this', 'that', 'its', 'his', 'her', 'their']);
const VERBS = new Set([
  'is', 'are', 'was', 'has', 'have', 'stands', 'stand', 'sits', 'sit', 'rests', 'rest', 'sleeps', 'lies', 'lie', 'lays',
  'floats', 'hovers', 'waits', 'hangs', 'leans', 'glows', 'shines', 'sparkles', 'flickers', 'burns', 'gleams',
  'teaches', 'guards', 'watches', 'wanders', 'walks', 'roams', 'here', 'sitting', 'standing', 'resting', 'lying',
  'can', 'will', 'seems', 'looks', 'stares', 'hums', 'buzzes', 'swims', 'flies', 'crawls', 'slithers', 'scurries',
]);
// Plural-looking words that are nouns, not verbs.
const NOT_VERBS = new Set(['boots', 'gloves', 'pants', 'leggings', 'sleeves', 'robes', 'glasses', 'scissors', 'tongs', 'remains', 'lessons', 'coins', 'keys', 'bones']);

/** Guess a usable keyword from a room line like "( 2) A large brown rat is here." */
export function guessTarget(line: string) {
  let s = line.replace(/^\s*\(\s*\d+\)\s*/, '');
  s = s.replace(/^(\s*(\[[^\]]*\]|\([^)]*\)))+\s*/, '');
  const words = s.replace(/[.!?]\s*$/, '').split(/\s+/).filter(Boolean);
  const clean = (w: string) => w.replace(/[^A-Za-z'-]/g, '').toLowerCase();

  // The subject ends at the first verb: a known one, or an "-s" word that follows a noun.
  let end = words.length;
  for (let i = 1; i < words.length; i++) {
    const w = clean(words[i]);
    const prev = clean(words[i - 1]);
    const verbish = VERBS.has(w) || (/[^s]s$/.test(w) && !NOT_VERBS.has(w) && !ARTICLES.has(prev) && prev !== 'of');
    if (verbish || /[,;:]$/.test(words[i - 1])) { end = i; break; }
  }
  const subject = words.slice(0, end);
  while (subject.length > 1 && ARTICLES.has(clean(subject[0]))) subject.shift();

  const first = subject[0] ?? '';
  const isProper = /^[A-Z]/.test(first) && !ARTICLES.has(first.toLowerCase());
  const kw = clean(isProper ? first : subject[subject.length - 1] ?? '');
  const count = Number(/^\s*\(\s*(\d+)\)/.exec(line)?.[1] ?? 1);
  return { kw, label: subject.join(' ') || s, isProper, count, flags: line.match(/\(([A-Z][^)]*)\)|\[[^\]]+\]/g) ?? [] };
}
