// Andolorian (Aardwolf) game time. One tick = one game hour, 24 hours a day (`help time`).
//   "  *  It is Noon in the daytime of the 97th day of the Season of the Snake, year 32 AVT."

export type Phase = 'night' | 'dawn' | 'day' | 'dusk';
export interface GameClock {
  hour?: number; // 0-23
  day?: number;
  season?: string;
  year?: number;
  syncedAt: number; // when the hour was last read or corrected
}
export const emptyClock = (): GameClock => ({ syncedAt: 0 });

const TIME_RE = /^\s*\*?\s*It is (.+?) in the (daytime|nighttime|morning|afternoon|evening|night)\b.*?\b(\d+)(?:st|nd|rd|th)? day of the (.+?), year (\d+)/i;

/** Hour from Aardwolf's wording: "Noon", "Midnight", "3 o'clock", "3 pm", "3am"… */
export function parseHour(words: string, period = ''): number | null {
  const w = words.trim().toLowerCase();
  if (w === 'noon') return 12;
  if (w === 'midnight') return 0;
  const m = /(\d{1,2})\s*(?:o'?clock)?\s*(am|pm|a\.m\.|p\.m\.)?/.exec(w);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  const pm = m[2] ? m[2].startsWith('p') : /afternoon|evening|night/.test(period.toLowerCase()) && !(Number(m[1]) <= 4 && /night/.test(period));
  if (pm) h += 12;
  return h >= 0 && h < 24 ? h : null;
}

/** A `time` reply line → the clock, or null if it isn't one. */
export function parseTimeLine(line: string): Omit<GameClock, 'syncedAt'> | null {
  const m = TIME_RE.exec(line);
  if (!m) return null;
  const hour = parseHour(m[1], m[2]);
  if (hour === null) return null;
  return { hour, day: Number(m[3]), season: m[4].replace(/^the\s+/i, ''), year: Number(m[5]) };
}

// Aardwolf's sun messages (outdoors), in the order the day goes.
export const SUN_EVENTS: [RegExp, number][] = [
  [/^The day has begun\./i, 5],
  [/^The sun rises in the east\./i, 6],
  [/^The sun slowly disappears in the west\./i, 19],
  [/^The night has begun\./i, 20],
];

export function phaseOf(hour: number): Phase {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 19) return 'day';
  if (hour >= 19 && hour < 21) return 'dusk';
  return 'night';
}

export function formatHour(hour: number): string {
  if (hour === 0) return 'Midnight';
  if (hour === 12) return 'Noon';
  return `${hour % 12} ${hour < 12 ? 'am' : 'pm'}`;
}

function ord(n: number) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
export const formatDate = (c: GameClock) =>
  c.day !== undefined ? `${ord(c.day)} day of the ${c.season}, year ${c.year} AVT` : '';
