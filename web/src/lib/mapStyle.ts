// What the middle character of an Aardwolf map cell means, and how both maps draw it.
export const CONTENT_STYLE: Record<string, { icon: string; color: string; label: string }> = {
  '$': { icon: 'storefront', color: '#ffd479', label: 'shop' },
  '!': { icon: 'pets', color: '#ff7b6b', label: 'creature here' },
  '*': { icon: 'person', color: '#8cb8f0', label: 'player here' },
  '?': { icon: 'door_open', color: '#7fdcd8', label: 'clan hall exit' },
};
/** Features that stay put, so they're remembered per room. Mobs and players are live only. */
export const LASTING = new Set(['$', '?']);

// Bracket pairs from Aardwolf's map key → terrain names the icon picker understands.
export const BRACKET_TERRAIN: Record<string, string> = {
  '[]': 'inside', ',`': 'field', '/\\': 'mountain', '~~': 'water', '..': 'city', '--': 'road',
  ';;': 'hills', '%%': 'cave', '##': 'dungeon', '(*': 'forest', '**': 'shop',
};
