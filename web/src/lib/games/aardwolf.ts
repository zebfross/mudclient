// Aardwolf (aardmud.org): GMCP with lower-case packages, {tags} in the text stream, <MAPSTART> maps.
import { AnsiParser, plain } from '../ansi.ts';
import { aardSegs, stripAard } from '../aardColor.ts';
import type { RoomInfo } from '../mapper.ts';
import { applyQuestEvent } from '../objectives.ts';
import { extractMap, mapNums, num } from './util.ts';
import type { GameAdapter } from './types.ts';

export const aardwolf: GameAdapter = {
  family: 'aardwolf',
  features: {
    hungerThirst: true, notes: true, objectives: true, shops: true, lasertag: true,
    gameClock: true, coords: true, diagonals: false, balance: false, movesLabel: 'MV',
  },
  quickCommands: ['look', 'score', 'where', 'quest info', 'campaign check', 'affects', 'scan', 'recall'],

  // The question itself, not the banner line above it ("Enter your character name or type 'NEW'…").
  namePrompt: /(?:what be thy name|what is your name|by what name)[^?]*\?\s*$|^\s*name\s*:\s*$/i,
  isLoginSignal: (pkg) => pkg.startsWith('char.'),
  onResume(host) {
    // The character data that comes back only arrives in the game, so it logs us in.
    host.gmcp('request char');
    host.gmcp('request room');
  },
  afterLogin(host) {
    host.gmcp('request char');
    host.gmcp('request room');
    host.setupTags();
    host.refreshInventory(300);
    setTimeout(() => host.requestTellHistory(), 700);
    setTimeout(() => host.refreshObjectives(), 1200);
    host.refreshMap(1600);
    setTimeout(() => host.refreshNotes(), 2200);
    setTimeout(() => host.syncTime(), 2600);
  },

  onGmcp(host, p, data) {
    const char = host.state.char;
    if (p === 'comm.tick') host.tick();
    else if (p === 'char.base') host.set({ char: { ...char, base: data } });
    else if (p === 'char.vitals') host.set({ char: { ...char, vitals: { hp: num(data.hp), mana: num(data.mana), moves: num(data.moves) } } });
    else if (p === 'char.maxstats') host.set({ char: { ...char, maxstats: mapNums(data) } });
    else if (p === 'char.stats') host.set({ char: { ...char, stats: mapNums(data) } });
    else if (p === 'char.status') host.set({ char: { ...char, status: data } });
    else if (p === 'char.worth') host.set({ char: { ...char, worth: mapNums(data) } });
    else if (p === 'room.info') {
      const room: RoomInfo = {
        num: num(data.num), name: stripAard(String(data.name ?? '')), zone: String(data.zone ?? ''),
        terrain: String(data.terrain ?? ''), details: String(data.details ?? ''),
        exits: mapNums(data.exits ?? {}), coord: data.coord,
      };
      host.enterRoom(room);
    } else if (p === 'comm.channel') {
      const raw = String(data.msg ?? '');
      host.addChat({ chan: String(data.chan), player: String(data.player ?? ''), msg: raw.includes('\x1b') ? new AnsiParser().parse(raw) : aardSegs(raw) });
    } else if (p === 'comm.quest') {
      host.set({ objectives: { ...host.state.objectives, quest: applyQuestEvent(host.state.objectives.quest, data ?? {}) } });
    } else if (p === 'group') {
      host.set({ group: { groupname: data.groupname, leader: data.leader, members: data.members ?? [] } });
    }
  },

  allowsQuiet: () => true,
  fetchMap(host) {
    host.captureReply('map', /^\s*<MAPSTART>/, (_text, segs) => {
      const { map, rest } = extractMap(segs);
      if (map.length) { host.set({ asciiMap: map }); host.noteMapMarks(); }
      for (const l of rest) if (plain(l).trim()) host.print({ segs: l }); // anything that wasn't the map
    });
  },

  doorCommand: (verb, dir) => `${verb} ${dir}`,
  // "The door is closed." / "The iron gate is closed."
  doorClosed: /^\s*The [\w' -]+ is closed\.\s*$/i,
  // "It's locked." (after open) / "The door is locked."
  doorLocked: /^\s*(?:it'?s locked|the [\w' -]+ is locked)/i,
  // Reasons a walk can't go on: stop, rather than send the rest of the route from the wrong room.
  walkBlocked: /^\s*(?:alas, you cannot go that way|you can'?t go that way|you are too exhausted|you'?re too exhausted|you are fighting|no way!? you are still fighting|you can'?t (?:do that|move)|you are (?:sleeping|resting|sitting)|nah\.\.\.|you'?re stuck)/i,
};
