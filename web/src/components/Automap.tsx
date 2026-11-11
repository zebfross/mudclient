import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { game, useGame } from '../lib/store.ts';
import { DIR_NAMES } from '../lib/mapper.ts';
import { CardHead, Empty, Icon, SegText, terrainIcon } from './ui.tsx';
import { GridMap } from './GridMap.tsx';
import { AreaMap } from './AreaMap.tsx';
import { parseAsciiMap } from '../lib/asciiMap.ts';
import { plain } from '../lib/ansi.ts';

const R = 3;           // grid radius in rooms
const CELL = 40;       // px per grid step
const TILE = 32;       // px tile size
const DIR_VEC: Record<string, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

type Mode = 'aard' | 'charted';
const MODE_KEY = 'gaslamp.mapMode';
const loadMode = (): Mode => { try { return localStorage.getItem(MODE_KEY) === 'charted' ? 'charted' : 'aard'; } catch { return 'aard'; } };

export function Automap() {
  const { room, loggedIn } = useGame();
  const [mode, setMode] = useState<Mode>(loadMode);
  const [expanded, setExpanded] = useState(false);
  const choose = (m: Mode) => { setMode(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ } };
  const map = game.mapper;

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  const controls = (
          <div className="flex items-center gap-1" role="group" aria-label="Map view">
            {([['aard', 'grid_on', `${game.gameName}'s map`], ['charted', 'hub', `Charted by you (${map.size} ${map.size === 1 ? 'room' : 'rooms'}), click to walk`]] as const).map(([m, icon, label]) => (
              <button key={m} onClick={() => choose(m)} title={label} aria-label={label} aria-pressed={mode === m}
                className={`p-1 rounded border ${mode === m ? 'bg-primary/20 text-primary border-primary/40' : 'text-outline border-surface-high/40 hover:text-on-surface'}`}>
                <Icon name={icon} className="text-base" />
              </button>
            ))}
            {mode === 'aard' && (
              <button onClick={() => game.refreshMap(0)} disabled={!loggedIn} title="Redraw map" aria-label="Redraw map"
                className="p-1 rounded border text-outline border-surface-high/40 hover:text-on-surface">
                <Icon name="refresh" className="text-base" />
              </button>
            )}
            <button onClick={() => setExpanded(true)} title="Area map: everything you've explored here" aria-label="Expand map"
              className="p-1 rounded border text-outline border-surface-high/40 hover:text-on-surface">
              <Icon name="open_in_full" className="text-base" />
            </button>
    </div>
  );

  return (
    <>
      <section className="card p-4">
        <CardHead icon="explore" title="Automap" right={controls} />
        <MapFrame mode={mode} />
      </section>
      {/* Portal: the sidebar is sticky, which would trap the overlay under the header and command bar. */}
      {expanded && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm p-3 sm:p-6 flex" onMouseDown={(e) => { if (e.target === e.currentTarget) setExpanded(false); }}>
          <section className="card p-4 flex-1 flex flex-col min-h-0 max-w-6xl mx-auto w-full" role="dialog" aria-label="Large map">
            <CardHead icon="map" title={`Area map${room?.zone ? ` · ${room.zone}` : ''}`} right={
              <span className="flex items-center gap-3"><Coords className="text-xs" /><button onClick={() => setExpanded(false)} title="Close (Esc)" aria-label="Close large map"
                className="p-1 rounded border bg-primary/20 text-primary border-primary/40"><Icon name="close_fullscreen" className="text-base" /></button></span>
            } />
            <AreaMap />
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}

function MapFrame({ mode }: { mode: Mode }) {
  const { room, mapVersion, asciiMap, loggedIn, mud } = useGame();
  const ire = mud.family === 'ire';
  const hasGrid = useMemo(() => !!parseAsciiMap(asciiMap.map(plain)), [asciiMap]);
  const map = game.mapper;
  const layout = useMemo(() => (room ? map.layout(room.num, R) : null), [room?.num, mapVersion]);
  const size = (R * 2 + 1) * CELL;
  const px = (v: number) => (v + R) * CELL + CELL / 2;

  const go = (target: number) => {
    if (!room) return;
    const path = map.path(room.num, target);
    if (path?.length) game.walk(path);
  };

  return (
      <div className="rounded-lg border border-surface-high/40 bg-surface-lowest/80 shadow-inner p-1.5 grid grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)_auto] items-center justify-items-center gap-1">
        {/* Iron Realms has diagonals: they take the corners, and up/down sit beside north/south. */}
        {ire ? <DirButton dir="nw" /> : <span />}
        {ire ? <span className="flex gap-1"><DirButton dir="n" /><DirButton dir="u" /></span> : <DirButton dir="n" />}
        {ire ? <DirButton dir="ne" /> : <DirButton dir="u" />}
        <DirButton dir="w" />
        <div className="w-full min-w-0 flex justify-center items-center overflow-auto scroll-thin py-1">
          {mode === 'aard' ? (
            asciiMap.length === 0 ? (
              <Empty>{loggedIn ? 'Drawing the map…' : `${game.gameName}'s map of your surroundings appears here.`}</Empty>
            ) : (
              <pre className="font-mono text-[12px] leading-[1.2] text-[#cfc6bd] select-text">
                {asciiMap.map((l, i) => <div key={i} className="min-h-[1lh]"><SegText segs={l} /></div>)}
              </pre>
            )
          ) : hasGrid ? (
            <GridMap />
          ) : !layout || layout.nodes.length === 0 ? (
            <Empty>The map fills in as you walk. Rooms are remembered in this browser.</Empty>
          ) : (
            <div className="relative" style={{ width: size, height: size, maxWidth: '100%' }}>
              <svg className="absolute inset-0" width={size} height={size} aria-hidden>
                {layout.edges.map((e, i) => {
                  const a = layout.nodes.find((n) => n.num === e.from)!;
                  const b = layout.nodes.find((n) => n.num === e.to)!;
                  return <line key={i} x1={px(a.x)} y1={px(a.y)} x2={px(b.x)} y2={px(b.y)} stroke="#554336" strokeWidth={2} strokeLinecap="round" />;
                })}
                {layout.stubs.map((st, i) => {
                  const n = layout.nodes.find((x) => x.num === st.num);
                  const v = DIR_VEC[st.dir];
                  if (!n || !v) return null;
                  const x = px(n.x), y = px(n.y);
                  return <line key={`s${i}`} x1={x + v[0] * TILE / 2} y1={y + v[1] * TILE / 2} x2={x + v[0] * (CELL / 2)} y2={y + v[1] * (CELL / 2)} stroke="#a38c7c" strokeWidth={2} strokeDasharray="2 3" />;
                })}
              </svg>
              {layout.nodes.map((n) => {
                const r = map.rooms.get(n.num)!;
                const here = n.num === room?.num;
                const vertical = ['u', 'd'].filter((d) => d in r.exits);
                return (
                  <button
                    key={n.num}
                    onClick={() => !here && go(n.num)}
                    title={`${r.name} (#${r.num})${here ? ' — you are here' : ' — click to walk'}`}
                    className={`group absolute grid place-items-center rounded-lg transition-transform hover:scale-110 ${
                      here
                        ? 'bg-primary border-2 border-primary-fixed ring-2 ring-primary/40 shadow-lg shadow-primary/40 z-10'
                        : 'bg-surface-high/90 border border-surface-highest hover:border-primary/60'
                    }`}
                    style={{ width: TILE, height: TILE, left: px(n.x) - TILE / 2, top: px(n.y) - TILE / 2, opacity: here ? 1 : Math.max(0.45, 1 - n.dist * 0.15) }}
                  >
                    <Icon name={here ? 'my_location' : terrainIcon(r.terrain)} className={here ? 'text-on-primary text-lg animate-pulse' : 'text-outline group-hover:text-on-surface text-base'} />
                    {vertical.length > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 rounded bg-secondary text-on-secondary text-[8px] font-mono font-bold px-0.5 leading-tight">{vertical.join('')}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <DirButton dir="e" />
        {ire ? <DirButton dir="sw" /> : <Coords />}
        {ire ? <span className="flex gap-1"><DirButton dir="s" /><DirButton dir="d" /></span> : <DirButton dir="s" />}
        {ire ? <DirButton dir="se" /> : <DirButton dir="d" />}
      </div>
  );
}

/** The current room's map coordinates (Aardwolf's x,y within the area or continent). */
export function Coords({ className = '' }: { className?: string }) {
  const { room } = useGame();
  const c = room?.coord;
  if (!c || c.x < 0 || c.y < 0) return <span />;
  const tip = `Coordinates ${c.x}, ${c.y}${c.cont ? ' on the continent' : ` in ${room?.zone ?? 'this area'}`}`;
  return (
    <span title={tip} aria-label={tip}
      className={`flex items-center gap-0.5 font-mono text-[10px] text-outline tabular-nums whitespace-nowrap ${className}`}>
      <Icon name="my_location" className="text-[11px]" />{c.x},{c.y}
    </span>
  );
}

const DIR_ICON: Record<string, string> = { u: 'arrow_upward', d: 'arrow_downward' };

/** One exit button on the map's edge: N/S show where they lead; E/W/U/D are compact. */
function DirButton({ dir }: { dir: 'n' | 's' | 'e' | 'w' | 'u' | 'd' | 'ne' | 'nw' | 'se' | 'sw' }) {
  const { room } = useGame();
  const exits = room?.exits ?? {};
  const open = dir in exits;
  const dest = open ? game.mapper.rooms.get(exits[dir])?.name ?? 'unexplored' : '';
  const wide = dir === 'n' || dir === 's';
  return (
    <button
      disabled={!open}
      onClick={() => game.walk([dir])}
      title={open ? `${DIR_NAMES[dir]}: ${dest}` : `No exit ${DIR_NAMES[dir]}`}
      aria-label={open ? `Go ${DIR_NAMES[dir]} to ${dest}` : `No exit ${DIR_NAMES[dir]}`}
      className={`flex items-center gap-1.5 rounded-full font-mono text-[11px] font-bold transition-colors shadow ${
        wide ? 'h-7 px-2.5 max-w-[220px]' : 'w-7 h-7 justify-center'
      } ${open ? 'bg-primary text-on-primary hover:bg-primary-fixed' : 'bg-surface-high/60 text-outline/60 cursor-not-allowed'}`}
    >
      {DIR_ICON[dir] ? <Icon name={DIR_ICON[dir]} className="text-sm" /> : dir.toUpperCase()}
      {wide && open && <span className="font-normal truncate">{dest}</span>}
    </button>
  );
}
