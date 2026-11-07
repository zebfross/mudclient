import { game, isOwnCorpse, useGame } from '../lib/store.ts';
import { plain } from '../lib/ansi.ts';
import { stripAard } from '../lib/aardColor.ts';
import { Bar, CardHead, Empty, Icon, SegText, fillCommand, guessTarget, terrainIcon } from './ui.tsx';

export function RoomHeader() {
  const { room, char } = useGame();
  const st = char.status;
  const perLevel = Number(char.base?.perlevel) || 1000;
  const tnl = Number(st?.tnl ?? 0);
  const enemy = st?.enemy ? stripAard(String(st.enemy)) : '';
  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-surface-high/40">
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Icon name={room ? terrainIcon(room.terrain) : 'foggy'} className="text-primary text-2xl" />
          <h1 className="font-display text-2xl sm:text-3xl text-primary font-bold tracking-wide">{room?.name ?? 'Beyond the Fog'}</h1>
          {room?.terrain && <span className="chip bg-primary/20 text-primary border-primary/30">{room.terrain}</span>}
          {room?.details && room.details.split(',').filter(Boolean).map((d) => (
            <span key={d} className="chip bg-surface-lowest/80 text-secondary border-secondary/40">{d}</span>
          ))}
        </div>
        <p className="font-mono text-xs text-on-surface-variant flex items-center gap-2 flex-wrap">
          <Icon name="pin_drop" className="text-outline text-xs" />
          {room
            ? <>Room #{room.num} • {room.zone}{room.coord && room.coord.x >= 0 ? ` • ${room.coord.x},${room.coord.y}` : ''}</>
            : 'Connect and log in to begin.'}
        </p>
      </div>
      <div className="flex items-center gap-2.5 flex-wrap">
        {st && (
          <div className="flex items-center gap-2 bg-surface-lowest/90 px-3 py-1.5 rounded-lg border border-surface-high/40 shadow-inner" title={`${tnl} experience to next level`}>
            <Icon name="military_tech" className="text-tertiary text-sm" />
            <span className="label-caps text-outline">Lvl {st.level}</span>
            <div className="w-16"><Bar value={perLevel - tnl} max={perLevel} className="bg-tertiary-container" /></div>
            <span className="font-mono text-xs text-tertiary font-bold">{tnl} tnl</span>
          </div>
        )}
        {enemy && (
          <div className="flex items-center gap-2 bg-error-container/40 px-3 py-1.5 rounded-lg border border-error/40 shadow-inner">
            <Icon name="swords" className="text-error text-sm" />
            <span className="label-caps text-error truncate max-w-[120px]">{enemy}</span>
            <div className="w-16"><Bar value={Number(st?.enemypct ?? 0)} max={100} className="bg-error" /></div>
            <span className="font-mono text-xs text-error font-bold">{st?.enemypct}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function RoomDescription() {
  const { roomDesc } = useGame();
  if (!roomDesc.length) return null;
  return (
    <p className="text-sm text-on-surface leading-relaxed border-l-2 border-primary/60 pl-3 italic p-2.5 rounded-r shadow-inner bg-surface-lowest/40">
      {roomDesc.join(' ')}
    </p>
  );
}

export function Souls({ bare = false }: { bare?: boolean }) {
  const { roomChars, loggedIn } = useGame();
  return (
    <section className={bare ? 'flex flex-col' : 'card p-4'}>
      <CardHead icon="group" iconClass="text-secondary" title="Souls Present"
        right={<span className="chip bg-surface-lowest/80 text-secondary border-surface-high/30">{roomChars.length} here</span>} />
      {roomChars.length === 0 ? (
        <Empty>{loggedIn ? 'No one else is here.' : 'Not yet in the world.'}</Empty>
      ) : (
        <ul className={`flex flex-col gap-2 ${bare ? '' : 'max-h-72 overflow-y-auto scroll-thin'}`}>
          {roomChars.map((segs, i) => {
            const t = guessTarget(plain(segs));
            return (
              <li key={i} className="bg-surface-lowest/40 p-2.5 rounded-lg border border-surface-high/40 flex items-center justify-between gap-2 shadow-inner">
                <button className="flex items-center gap-2.5 min-w-0 text-left" onClick={() => fillCommand(`look ${t.kw}`)} title="Put 'look' in the command bar">
                  <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${t.isProper ? 'bg-primary-container/20' : 'bg-secondary-container/20'}`}>
                    <Icon name={t.isProper ? 'person' : 'pets'} className={t.isProper ? 'text-primary' : 'text-secondary'} />
                  </div>
                  <span className="text-xs leading-snug min-w-0"><SegText segs={segs} /></span>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  {t.count > 1 && <span className="chip text-outline border-surface-high/40">×{t.count}</span>}
                  <button className="btn" onClick={() => game.command(`consider ${t.kw}`)} title={`consider ${t.kw}`}>Con</button>
                  <button className="btn btn-secondary" onClick={() => game.command(`look ${t.kw}`)} title={`look ${t.kw}`}>
                    <Icon name="visibility" className="text-[11px]" /> Look
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function Curios({ bare = false }: { bare?: boolean }) {
  const { roomObjs, char } = useGame();
  const me = char.base?.name ? stripAard(String(char.base.name)) : undefined;
  return (
    <section className={bare ? '@container flex flex-col' : '@container card p-4 sm:p-5'}>
      <CardHead icon="category" iconClass="text-secondary" title="Curios & Objects"
        right={<span className="chip bg-surface-mid text-outline border-surface-high/30">{roomObjs.length} in reach</span>} />
      {roomObjs.length === 0 ? (
        <Empty>Nothing of note lies about.</Empty>
      ) : (
        <div className="grid grid-cols-1 @lg:grid-cols-2 @4xl:grid-cols-4 gap-3">
          {roomObjs.map((segs, i) => {
            const t = guessTarget(plain(segs));
            const mine = isOwnCorpse(plain(segs), me);
            return (
              <div key={i} className={`p-3 rounded-lg border shadow-md flex flex-col justify-between gap-3 ${mine ? 'bg-error-container/30 border-error/50' : 'bg-surface-lowest/40 border-primary/25'}`}>
                <div className="flex items-start gap-2.5">
                  <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${mine ? 'bg-error-container/50' : 'bg-primary-container/20'}`}>
                    <Icon name={mine ? 'skull' : 'deployed_code'} className={`${mine ? 'text-error' : 'text-primary'} text-xl`} />
                  </div>
                  <span className="text-xs leading-snug"><SegText segs={segs} /></span>
                </div>
                {mine ? (
                  <div className="flex items-center gap-1.5 pt-2 border-t border-surface-high/30">
                    <span className="text-[11px] text-error flex-1">Your corpse, with your belongings.</span>
                    <button className="btn btn-primary" onClick={() => game.command('get all corpse')}><Icon name="back_hand" className="text-xs" /> Loot</button>
                  </div>
                ) : (
                <div className="flex items-center gap-1.5 pt-2 border-t border-surface-high/30">
                  <button className="btn flex-1" onClick={() => game.command(`look ${t.kw}`)}>Inspect</button>
                  <button className="btn btn-primary" onClick={() => game.command(`get ${t.kw}`)}><Icon name="back_hand" className="text-xs" /> Take</button>
                  <button className="btn px-1.5" title="Edit the command first" onClick={() => fillCommand(`get ${t.kw}`)}><Icon name="edit" className="text-xs" /></button>
                </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Shown after you die: find and loot your corpse. */
export function DeathBanner() {
  const { death } = useGame();
  if (!death) return null;
  return (
    <section className="rounded-xl border border-error/50 bg-error-container/30 backdrop-blur-md shadow-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3" role="alert">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Icon name="skull" className="text-error text-3xl" />
        <div>
          <h2 className="font-display text-base text-error font-semibold">You have fallen</h2>
          <p className="text-xs text-on-surface-variant">Your belongings are on your corpse. Find it, walk there, then loot it.</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button className="btn" onClick={() => game.command('ownedwhere')}><Icon name="travel_explore" className="text-xs" /> Find my corpse</button>
        <button className="btn btn-primary" onClick={() => game.command('get all corpse')}><Icon name="back_hand" className="text-xs" /> Loot corpse</button>
        <button className="btn px-2" onClick={() => game.dismissDeath()} title="Dismiss" aria-label="Dismiss"><Icon name="close" className="text-xs" /></button>
      </div>
    </section>
  );
}
