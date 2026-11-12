// What the middle character of an Aardwolf map cell means, and how both maps draw it.
export const CONTENT_STYLE: Record<string, { icon: string; color: string; label: string }> = {
  '$': { icon: 'storefront', color: '#ffd479', label: 'shop' },
  '!': { icon: 'pets', color: '#ff7b6b', label: 'creature here' },
  '*': { icon: 'person', color: '#8cb8f0', label: 'player here' },
  '?': { icon: 'door_open', color: '#7fdcd8', label: 'clan hall exit' },
  '&': { icon: 'account_balance', color: '#c9b3ff', label: 'bank' },
  '@': { icon: 'mail', color: '#9fd88a', label: 'post office' },
};
/** Features that stay put, so they're remembered per room. Mobs and players are live only. */
export const LASTING = new Set(['$', '?']);

// Iron Realms says what a room is in GMCP Room.Info details: ["shop", "indoors"]. Its ASCII map
// doesn't mark shops, so this is the only way to know.
const DETAIL_MARK: Record<string, string> = { shop: '$', bank: '&', postoffice: '@' };

/** A visited room's lasting feature: from the game's map (Aardwolf) or the room's details (IRE). */
export function roomMark(room: { mark?: string; details?: string } | undefined): string | undefined {
  if (!room) return undefined;
  if (room.mark) return room.mark;
  for (const d of (room.details ?? '').split(',')) { const m = DETAIL_MARK[d.trim().toLowerCase()]; if (m) return m; }
  return undefined;
}

// Bracket pairs from Aardwolf's map key → terrain names the icon picker understands.
export const BRACKET_TERRAIN: Record<string, string> = {
  '[]': 'inside', ',`': 'field', '/\\': 'mountain', '~~': 'water', '..': 'city', '--': 'road',
  ';;': 'hills', '%%': 'cave', '##': 'dungeon', '(*': 'forest', '**': 'shop',
};
