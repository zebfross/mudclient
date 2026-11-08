import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { game, useGame } from '../lib/store.ts';
import { DIR_NAMES } from '../lib/mapper.ts';
import { CardHead, Empty, Icon, SegText, terrainIcon } from './ui.tsx';
import { GridMap } from './GridMap.tsx';
import { parseAsciiMap } from '../lib/asciiMap.ts';
import { plain } from '../lib/ansi.ts';

const R_SMALL = 3;     // grid radius in rooms
const R_BIG = 6;       // radius in the expanded view
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
            {([['aard', 'grid_on', "Aardwolf's map"], ['charted', 'hub', `Charted by you (${map.size} ${map.size === 1 ? 'room' : 'rooms'}), click to walk`]] as const).map(([m, icon, label]) => (
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
            <button onClick={() => setExpanded(!expanded)} title={expanded ? 'Close large map (Esc)' : 'Expand map'} aria-label={expanded ? 'Close large map' : 'Expand map'}
              className={`p-1 rounded border ${expanded ? 'bg-primary/20 text-primary border-primary/40' : 'text-outline border-surface-high/40 hover:text-on-surface'}`}>
              <Icon name={expanded ? 'close_fullscreen' : 'open_in_full'} className="text-base" />
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
            <CardHead icon="explore" title={room?.name ?? 'Automap'} right={controls} />
            <MapFrame mode={mode} big />
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}

function MapFrame({ mode, big = false }: { mode: Mode; big?: boolean }) {
  const { room, mapVersion, asciiMap, loggedIn } = useGame();
  const hasGrid = useMemo(() => !!parseAsciiMap(asciiMap.map(plain)), [asciiMap]);
  const map = game.mapper;
  const R = big ? R_BIG : R_SMALL;
  const layout = useMemo(() => (room ? map.layout(room.num, R) : null), [room?.num, mapVersion, R]);
  const size = (R * 2 + 1) * CELL;
  const px = (v: number) => (v + R) * CELL + CELL / 2;

  const go = (target: number) => {
    if (!room) return;
    const path = map.path(room.num, target);
    if (path?.length) game.commands(path.map((d) => DIR_NAMES[d] ?? d));
  };

  return (
      <div className={`rounded-lg border border-surface-high/40 bg-surface-lowest/80 shadow-inner p-1.5 grid grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)_auto] items-center justify-items-center gap-1 ${big ? 'flex-1 min-h-0 mt-1' : ''}`}>
        <span />
        <DirButton dir="n" />
        <DirButton dir="u" />
        <DirButton dir="w" />
        <div className={`w-full min-w-0 flex justify-center items-center overflow-auto scroll-thin py-1 ${big ? 'h-full' : ''}`}>
          {mode === 'aard' ? (
            asciiMap.length === 0 ? (
              <Empty>{loggedIn ? 'Drawing the map…' : "Aardwolf's map of your surroundings appears here."}</Empty>
            ) : (
              <pre className={`font-mono leading-[1.2] text-[#cfc6bd] select-text ${big ? 'text-[clamp(14px,3.2vh,30px)]' : 'text-[12px]'}`}>
                {asciiMap.map((l, i) => <div key={i} className="min-h-[1lh]"><SegText segs={l} /></div>)}
              </pre>
            )
          ) : hasGrid ? (
            <GridMap big={big} />
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
        <span />
        <DirButton dir="s" />
        <DirButton dir="d" />
      </div>
  );
}

const DIR_ICON: Record<string, string> = { u: 'arrow_upward', d: 'arrow_downward' };

/** One exit button on the map's edge: N/S show where they lead; E/W/U/D are compact. */
function DirButton({ dir }: { dir: 'n' | 's' | 'e' | 'w' | 'u' | 'd' }) {
  const { room } = useGame();
  const exits = room?.exits ?? {};
  const open = dir in exits;
  const dest = open ? game.mapper.rooms.get(exits[dir])?.name ?? 'unexplored' : '';
  const wide = dir === 'n' || dir === 's';
  return (
    <button
      disabled={!open}
      onClick={() => game.command(DIR_NAMES[dir])}
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
