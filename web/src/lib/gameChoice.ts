// Which game this browser plays, chosen from the header. Each game keeps its own saved login,
// map, chat, command history and Quick actions: those storage keys get the game as a suffix
// (Aardwolf keeps the plain keys, so nothing saved before games could be switched is lost).
import type { Family } from './games/types.ts';

export interface GameChoice { id: string; name: string; family: Family }

// Must match the relay's PROFILES.
export const GAMES: GameChoice[] = [
  { id: 'aardwolf', name: 'Aardwolf', family: 'aardwolf' },
  { id: 'achaea', name: 'Achaea', family: 'ire' },
];

const CHOICE_KEY = 'gaslamp.game';

function readChoice(): GameChoice {
  try {
    const id = localStorage.getItem(CHOICE_KEY);
    return GAMES.find((g) => g.id === id) ?? GAMES[0];
  } catch { return GAMES[0]; }
}

/** Fixed for the life of the page: switching games reloads it. */
export const currentGame: GameChoice = readChoice();

/** A storage key for this game's own copy of something. */
export const gameKey = (key: string, game: GameChoice = currentGame) => (game.id === 'aardwolf' ? key : `${key}@${game.id}`);

/** Play another game: remember the choice and start the page afresh with that game's data. */
export function switchGame(id: string) {
  if (id === currentGame.id || !GAMES.some((g) => g.id === id)) return;
  try { localStorage.setItem(CHOICE_KEY, id); } catch { /* the choice just won't stick */ }
  location.reload();
}
