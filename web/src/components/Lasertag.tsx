import { useEffect, useState } from 'react';
import { game, useGame } from '../lib/store.ts';
import type { Target, Team } from '../lib/lasertag.ts';
import { Bar, CardHead, Empty, Icon, fillCommand } from './ui.tsx';

const TEAM_STYLE: Record<Team, string> = {
  red: 'bg-[#d4574a]/20 text-[#ff7b6b] border-[#d4574a]/50',
  green: 'bg-tertiary/15 text-tertiary border-tertiary/40',
};
const DIR_ICON: Record<string, string> = { north: 'north', south: 'south', east: 'east', west: 'west', up: 'arrow_upward', down: 'arrow_downward' };

/** Aardwolf's arena zone, or a prompt showing charges, means you're in a game. */
export function useInArena() {
  const { room, lasertag } = useGame();
  return /laser/i.test(room?.zone ?? '') || Date.now() - lasertag.chargesAt < 120_000;
}

function TeamChip({ team }: { team?: Team }) {
  if (!team) return null;
  return <span className={`chip ${TEAM_STYLE[team]}`}>{team}</span>;
}

export function LasertagPanel() {
  const { lasertag: lt, loggedIn, room } = useGame();
  const inArena = useInArena();
  const mustMove = lt.firedInRoom !== undefined && lt.firedInRoom === room?.num;
  const groups = new Map<string, Target[]>();
  for (const t of lt.targets) groups.set(t.dir, [...(groups.get(t.dir) ?? []), t]);
  const age = lt.scanAt ? Math.round((Date.now() - lt.scanAt) / 1000) : null;

  return (
    <section className="flex flex-col gap-4">
      <CardHead icon="target" title="Lasertag" right={<TeamChip team={lt.team} />} />
      {!loggedIn ? <Empty>Log in to play Lasertag.</Empty> : (
        <>
          {/* Charges */}
          {lt.charges !== undefined && (
            <div className="flex items-center gap-2">
              <Icon name="bolt" className="text-primary text-base" />
              <div className="flex-1"><Bar value={lt.charges} max={lt.maxCharges ?? lt.charges} className="bg-gradient-to-r from-primary-container to-primary" h="h-2" /></div>
              <span className="font-mono text-[11px] text-primary tabular-nums">{lt.charges}{lt.maxCharges ? `/${lt.maxCharges}` : ''}</span>
            </div>
          )}

          {/* Game */}
          <div className="rounded-lg border border-surface-high/40 bg-surface-lowest/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="label-caps text-outline">{inArena ? 'In the arena' : 'Game'}</span>
              <div className="flex gap-1.5">
                <button className="btn" onClick={() => game.ltStatus()}>Status</button>
                {!inArena && <button className="btn btn-primary" onClick={() => game.command('lasertag join')}>Join</button>}
              </div>
            </div>
            <NextGame at={lt.nextGameAt} />
            {lt.status.length > 0
              ? <ul className="text-xs text-on-surface-variant flex flex-col gap-0.5">{lt.status.map((l, i) => <li key={i}>{l}</li>)}</ul>
              : <p className="text-xs text-outline">Check when the next game starts, then join from here.</p>}
          </div>

          {/* Targets */}
          <div className="rounded-lg border border-[#d4574a]/40 bg-surface-lowest/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="label-caps text-[#ff7b6b]">Targets</span>
              <div className="flex items-center gap-2">
                {age !== null && <span className="font-mono text-[10px] text-outline">{age < 60 ? `${age}s ago` : 'stale'}</span>}
                <button className="btn" onClick={() => game.ltScan()}><Icon name="radar" className="text-xs" /> Scan</button>
              </div>
            </div>
            {mustMove && (
              <p className="text-[11px] text-secondary mb-2 flex items-center gap-1"><Icon name="directions_run" className="text-sm" /> You fired from this room. Move before shooting again.</p>
            )}
            {lt.targets.length === 0 ? (
              <p className="text-xs text-outline">{lt.scanAt ? 'Nobody in range. People in your own room can’t be shot.' : 'Scan to see who you can shoot.'}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {[...groups].map(([dir, list]) => (
                  <div key={dir}>
                    <div className="flex items-center gap-1 label-caps text-[9px] text-outline mb-1"><Icon name={DIR_ICON[dir] ?? 'explore'} className="text-xs" />{dir}</div>
                    <ul className="flex flex-col gap-1">
                      {list.map((t, i) => {
                        const team = game.teamOf(t);
                        const friendly = !!team && team === lt.team;
                        return (
                          <li key={`${t.name}-${i}`} className="flex items-center gap-2 rounded bg-surface-mid/60 px-2 py-1.5">
                            <span className="text-xs font-semibold flex-1 min-w-0 truncate" title={t.label}>{t.name}</span>
                            <span className="font-mono text-[10px] text-outline">{t.dist > 1 ? `${t.dist} rooms` : 'next room'}</span>
                            <TeamChip team={team} />
                            <button className="btn px-1.5" title="Edit the shot first" onClick={() => fillCommand(`shoot ${t.dir} ${t.name}`)}><Icon name="edit" className="text-xs" /></button>
                            <button
                              className="btn btn-danger"
                              disabled={friendly || mustMove}
                              title={friendly ? 'Teammate: hitting them costs points' : mustMove ? 'Move first' : `shoot ${t.dir} ${t.name}`}
                              onClick={() => game.ltShoot(t)}
                            >
                              <Icon name="my_location" className="text-xs" /> {friendly ? 'Ally' : 'Shoot'}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-1.5">
            <button className="btn" onClick={() => game.command('decoy')} title="Leave a decoy that fools hunters"><Icon name="theater_comedy" className="text-xs" /> Decoy</button>
            <button className="btn" onClick={() => game.command('transloc')} title="Jump to a random spot in the arena"><Icon name="shuffle" className="text-xs" /> Transloc</button>
            <button className="btn" onClick={() => game.command('recall')} title="Back to your starting room"><Icon name="home" className="text-xs" /> Recall</button>
            {lt.team
              ? <button className="btn" onClick={() => game.command(`hunt ${lt.team}mascot`)} title="Direction to your team's mascot"><Icon name="flag" className="text-xs" /> Find mascot</button>
              : <button className="btn" onClick={() => fillCommand('hunt redmascot')} title="Pick your team's mascot"><Icon name="flag" className="text-xs" /> Mascot…</button>}
          </div>

          {/* Scores and teams */}
          <div className="rounded-lg border border-surface-high/40 bg-surface-lowest/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="label-caps text-outline">Scoreboard</span>
              <div className="flex gap-1.5">
                <button className="btn" onClick={() => game.ltScore()}>Score</button>
                <button className="btn" onClick={() => game.ltTeams()}>Teams</button>
              </div>
            </div>
            {lt.score.length > 0 && <pre className="font-mono text-[11px] text-on-surface-variant whitespace-pre-wrap mb-2">{lt.score.join('\n')}</pre>}
            {(lt.rosters.red.length > 0 || lt.rosters.green.length > 0) ? (
              <div className="grid grid-cols-2 gap-2">
                {(['red', 'green'] as const).map((team) => (
                  <div key={team}>
                    <TeamChip team={team} />
                    <ul className="mt-1 text-xs text-on-surface-variant">{lt.rosters[team].map((n) => <li key={n}>{n}</li>)}</ul>
                  </div>
                ))}
              </div>
            ) : lt.score.length === 0 && <p className="text-xs text-outline">Scores and team lists appear here during a game.</p>}
          </div>
        </>
      )}
    </section>
  );
}

function NextGame({ at }: { at?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  if (!at) return null;
  const mins = Math.max(0, Math.round((at - now) / 60_000));
  const when = new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <div className="flex items-baseline gap-2 mb-2">
      <span className="font-display text-2xl text-primary tabular-nums">{mins > 0 ? `~${mins} min` : 'Starting'}</span>
      <span className="text-[11px] text-outline">next game, around {when}</span>
    </div>
  );
}
