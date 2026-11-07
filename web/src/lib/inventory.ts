// Inventory categories for the Satchel's sub-tabs, by Aardwolf item type number (see `help invdata`).
export type Category = 'all' | 'weapons' | 'armor' | 'consumables' | 'tools' | 'equipped';

const BY_TYPE: Record<number, Exclude<Category, 'all' | 'equipped'>> = {
  5: 'weapons',
  7: 'armor',
  // Treasure (6) isn't reliably wearable (e.g. the Newbie Guide), so it goes under 'tools'.
  8: 'consumables', 19: 'consumables', 14: 'consumables', 12: 'consumables', 2: 'consumables', // potion, pill, food, drink, scroll
};

export const categoryOf = (type: number) => BY_TYPE[type] ?? 'tools';

export const CATEGORIES: { id: Category; icon: string; label: string }[] = [
  { id: 'all', icon: 'apps', label: 'All carried' },
  { id: 'weapons', icon: 'swords', label: 'Weapons' },
  { id: 'armor', icon: 'shield', label: 'Armor' },
  { id: 'consumables', icon: 'science', label: 'Consumables' },
  { id: 'tools', icon: 'construction', label: 'Tools & other' },
  { id: 'equipped', icon: 'checkroom', label: 'Equipped' },
];
