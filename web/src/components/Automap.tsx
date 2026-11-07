import { useMemo, useState } from 'react';
import { game, useGame } from '../lib/store.ts';
import { DIR_NAMES } from '../lib/mapper.ts';
import { CardHead, Empty, Icon, SegText, terrainIcon } from './ui.tsx';

const R = 3;           // grid radius in rooms
const CELL = 40;       // px per grid step
const TILE = 32;       // px tile size
const DIR_VEC: Record<string, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

type Mode = 'aard' | 'charted';
const MODE_KEY = 'gaslamp.mapMode';
const loadMode = (): Mode => { try { return localStorage.getItem(MODE_KEY) === 'charted' ? 'charted' : 'aard'; } catch { return 'aard'; } };

export function Automap({ compact = false }: { compact?: boolean }) {
  const { room, mapVersion, asciiMap, loggedIn } = useGame();
  const [mode, setMode] = useState<Mode>(loadMode);
  const choose = (m: Mode) => { setMode(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ } };
  const map = game.mapper;
  const layout = useMemo(() => (room ? map.layout(room.num, R) : null), [room?.num, mapVersion]);
  const size = (R * 2 + 1) * CELL;
  const px = (v: number) => (v + R) * CELL + CELL / 2;

  const go = (target: number) => {
    if (!room) return;
    const path = map.path(room.num, target);
    if (path?.length) game.commands(path.map((d) => DIR_NAMES[d] ?? d));
  };

  return (
    <section className="card p-4">
      <CardHead
        icon="explore"
        title="Automap"
        right={
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
          </div>
        }
      />
      {mode === 'aard' ? (
        asciiMap.length === 0 ? (
          <Empty>{loggedIn ? 'Drawing the map…' : "Aardwolf's map of your surroundings appears here."}</Empty>
        ) : (
          <div className="flex justify-center rounded-lg border border-surface-high/40 bg-surface-lowest/80 shadow-inner p-3 overflow-x-auto scroll-thin">
            <pre className="font-mono text-[12px] leading-[1.2] text-[#cfc6bd] select-text">
              {asciiMap.map((l, i) => <div key={i} className="min-h-[1lh]"><SegText segs={l} /></div>)}
            </pre>
          </div>
        )
      ) : !layout || layout.nodes.length === 0 ? (
        <Empty>The map fills in as you walk. Rooms are remembered in this browser.</Empty>
      ) : (
        <div className="flex justify-center rounded-lg border border-surface-high/40 bg-surface-lowest/70 shadow-inner py-2 overflow-hidden">
          <div className="relative" style={{ width: size, height: size, maxWidth: '100%' }}>
            <svg className="absolute inset-0" width={size} height={size} aria-hidden>
              {layout.edges.map((e, i) => {
                const a = layout.nodes.find((n) => n.num === e.from)!;
                const b = layout.nodes.find((n) => n.num === e.to)!;
                return <line key={i} x1={px(a.x)} y1={px(a.y)} x2={px(b.x)} y2={px(b.y)} stroke="#554336" strokeWidth={2} strokeLinecap="round" />;
              })}
              {layout.stubs.map((s, i) => {
                const n = layout.nodes.find((x) => x.num === s.num);
                const v = DIR_VEC[s.dir];
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
        </div>
      )}
      {room && !compact && (
        <div className="mt-3">
          <div className="label-caps text-[10px] text-outline border-b border-surface-high/30 pb-1 mb-2">Traverse</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {Object.entries(room.exits).map(([dir, to]) => {
              const dest = map.rooms.get(to);
              return (
                <button key={dir} className="btn justify-start text-primary normal-case tracking-normal" onClick={() => game.command(DIR_NAMES[dir] ?? dir)} title={dest ? dest.name : 'Unexplored'}>
                  <Icon name={{ n: 'north', s: 'south', e: 'east', w: 'west', u: 'arrow_upward', d: 'arrow_downward' }[dir] ?? 'call_made'} className="text-xs" />
                  <span className="uppercase">{dir}</span>
                  <span className="truncate font-normal text-on-surface-variant">{dest ? dest.name : '?'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
