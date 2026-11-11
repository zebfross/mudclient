import { aardwolf } from './aardwolf.ts';
import { ire } from './ire.ts';
import type { Family, GameAdapter } from './types.ts';

export type { Family, Features, GameAdapter, Host } from './types.ts';

const ADAPTERS: Record<Family, GameAdapter> = { aardwolf, ire };

/** The adapter for a family name from the relay; Aardwolf if unknown. */
export const adapterFor = (family: string | undefined): GameAdapter => ADAPTERS[family as Family] ?? aardwolf;
