import { useEffect, useMemo, useRef, useState } from 'react';
import { game, useGame } from '../lib/store.ts';
import { DIRS, DIR_NAMES } from '../lib/mapper.ts';
import { Icon, terrainIcon } from './ui.tsx';
import { plain } from '../lib/ansi.ts';
import { labelGrid, parseAsciiMap } from '../lib/asciiMap.ts';
import { CONTENT_STYLE } from '../lib/mapStyle.ts';

const CELL = 64; // world units between room centres
const TILE = 36;
const MIN_K = 0.25, MAX_K = 3;
const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

interface View { k: number; x: number; y: number }

/**
 * Every room you've visited in the current area, laid out from GMCP exits, with unvisited exits as
 * ghost rooms. Drag to pan, scroll or the buttons to zoom, click a room to walk there.
 */
export function AreaMap() {
  const { room, mapVersion, asciiMap } = useGame();
  const map = game.mapper;
  const layout = useMemo(() => (room ? map.areaLayout(room.num) : null), [room?.num, mapVersion]);
  // Who/what is in each room right now, from Aardwolf's live map around you.
  const live = useMemo(() => {
    const grid = parseAsciiMap(asciiMap.map(plain));
    const out = new Map<number, string>();
    if (grid && room) for (const [k, num] of labelGrid(grid, room, map)) out.set(num, grid.byPos.get(k)!.contents);
    return out;
  }, [asciiMap, room, mapVersion]);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const nodes = layout?.nodes ?? [];
  const pos = useMemo(() => new Map(nodes.map((n) => [n.num, n])), [layout]);
  const visited = nodes.filter((n) => !n.ghost).length;

  // `view.x/y` is where *you* sit on screen (the layout is built around your room at 0,0).
  const centreOn = (k: number) => setView({ k, x: size.w / 2, y: size.h / 2 });
  const fit = () => {
    const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = clampK(Math.min(1.3, size.w / ((x1 - x0 + 2) * CELL), size.h / ((y1 - y0 + 2) * CELL)) || 1);
    setView({ k, x: size.w / 2 - ((x0 + x1) / 2) * CELL * k, y: size.h / 2 - ((y0 + y1) / 2) * CELL * k });
  };
  // First show: fit the whole area. When you walk, keep the map still (shift by your step) and only
  // recentre if you'd leave the visible part.
  const prevRoom = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!size.w || !layout) return;
    const prev = prevRoom.current;
    prevRoom.current = room?.num;
    if (!view) return fit();
    const p = prev !== undefined ? pos.get(prev) : undefined;
    if (!p) return centreOn(view.k);
    const x = view.x - p.x * CELL * view.k, y = view.y - p.y * CELL * view.k;
    const m = TILE * view.k;
    if (x < m || y < m || x > size.w - m || y > size.h - m) centreOn(view.k);
    else setView({ ...view, x, y });
  }, [size.w, size.h, room?.num]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wheel zoom around the cursor (non-passive so the page doesn't scroll).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      setView((v) => {
        if (!v) return v;
        const k = clampK(v.k * Math.exp(-e.deltaY * 0.0015));
        return { k, x: mx - (mx - v.x) * (k / v.k), y: my - (my - v.y) * (k / v.k) };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoom = (f: number) => setView((v) => {
    if (!v) return v;
    const k = clampK(v.k * f), cx = size.w / 2, cy = size.h / 2;
    return { k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) };
  });

  const walkTo = (num: number) => {
    if (suppressClick.current || !room || num === room.num) return;
    const n = pos.get(num);
    let path = n?.ghost ? (n.from !== undefined ? map.path(room.num, n.from) : null) : map.path(room.num, num);
    if (path && n?.ghost && n.dir) path = [...path, n.dir];
    if (path?.length) game.commands(path.map((d) => DIR_NAMES[d] ?? d));
  };

  if (!room || !layout || nodes.length === 0) {
    return <div className="flex-1 grid place-items-center text-sm text-outline">The area map fills in as you walk.</div>;
  }

  const k = view?.k ?? 1;
  const showNames = k >= 0.9;
  const exitsOut = nodes.flatMap((n) => {
    if (n.ghost) return [];
    const r = map.rooms.get(n.num);
    return Object.entries(r?.exits ?? {})
      .filter(([d, to]) => DIRS[d] && map.rooms.get(to) && map.rooms.get(to)!.zone !== layout.zone)
      .map(([d, to]) => ({ n, d, to: map.rooms.get(to)! }));
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap text-[11px] text-outline">
        <span className="font-mono">{visited} {visited === 1 ? 'room' : 'rooms'} explored{nodes.length > visited ? ` · ${nodes.length - visited} unexplored exits` : ''}</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-primary" /> you</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border border-dashed border-[#6d5a4c]" /> not visited</span>
        <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed border-secondary" /> to another area</span>
        {Object.values(CONTENT_STYLE).map((c) => (
          <span key={c.icon} className="flex items-center gap-0.5"><Icon name={c.icon} className="text-sm" style={{ color: c.color }} />{c.label.replace(' here', '')}</span>
        ))}
        <span className="ml-auto flex items-center gap-1">
          <button className="btn px-1.5" onClick={() => zoom(1 / 1.25)} aria-label="Zoom out" title="Zoom out"><Icon name="remove" className="text-sm" /></button>
          <span className="font-mono w-10 text-center">{Math.round(k * 100)}%</span>
          <button className="btn px-1.5" onClick={() => zoom(1.25)} aria-label="Zoom in" title="Zoom in"><Icon name="add" className="text-sm" /></button>
          <button className="btn px-1.5" onClick={() => centreOn(Math.max(k, 1))} aria-label="Centre on you" title="Centre on you"><Icon name="my_location" className="text-sm" /></button>
          <button className="btn px-1.5" onClick={fit} aria-label="Fit the whole area" title="Fit the whole area"><Icon name="fit_screen" className="text-sm" /></button>
        </span>
      </div>
      <div
        ref={box}
        className="relative flex-1 min-h-0 rounded-lg border border-surface-high/40 bg-surface-lowest/80 shadow-inner overflow-hidden cursor-grab active:cursor-grabbing touch-none select-none"
        onPointerDown={(e) => {
          if (!view || e.button !== 0) return;
          drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
          suppressClick.current = false;
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
          if (!d.moved && Math.hypot(dx, dy) < 4) return;
          if (!d.moved) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          d.moved = true;
          suppressClick.current = true;
          setView((v) => v && { ...v, x: d.vx + dx, y: d.vy + dy });
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        {view && (
          <svg className="absolute inset-0" width="100%" height="100%" role="img" aria-label={`Map of ${layout.zone}`}>
            <g transform={`translate(${view.x - (pos.get(room.num)?.x ?? 0) * CELL * view.k},${view.y - (pos.get(room.num)?.y ?? 0) * CELL * view.k}) scale(${view.k})`}>
              {layout.edges.map((e) => {
                const a = pos.get(e.from), b = pos.get(e.to);
                if (!a || !b) return null;
                return <line key={`${e.from}-${e.to}`} x1={a.x * CELL} y1={a.y * CELL} x2={b.x * CELL} y2={b.y * CELL}
                  stroke="#6d5a4c" strokeWidth={3} strokeLinecap="round" strokeDasharray={a.ghost || b.ghost ? '4 5' : undefined} />;
              })}
              {exitsOut.map(({ n, d, to }) => {
                const [dx, dy] = DIRS[d];
                return (
                  <line key={`${n.num}${d}`} x1={n.x * CELL + dx * TILE / 2} y1={n.y * CELL + dy * TILE / 2} x2={n.x * CELL + dx * CELL * 0.6} y2={n.y * CELL + dy * CELL * 0.6}
                    stroke="#ffb68e" strokeWidth={2.5} strokeDasharray="3 4">
                    <title>{`${DIR_NAMES[d]} to ${to.name} (${to.zone})`}</title>
                  </line>
                );
              })}
              {nodes.map((n) => {
                const r = map.rooms.get(n.num);
                const here = n.num === room.num;
                const vertical = r ? ['u', 'd'].filter((d) => d in r.exits).join('') : '';
                const what = CONTENT_STYLE[live.get(n.num) ?? ''] ?? CONTENT_STYLE[r?.mark ?? ''];
                const name = r?.name ?? `Unexplored (${DIR_NAMES[n.dir ?? ''] ?? '?'} of ${map.rooms.get(n.from ?? -1)?.name ?? '?'})`;
                return (
                  <g key={n.num} transform={`translate(${n.x * CELL - TILE / 2},${n.y * CELL - TILE / 2})`}
                    onClick={() => walkTo(n.num)} className={here ? '' : 'cursor-pointer [&:hover>rect]:stroke-[#ffb77d]'}>
                    <title>{`${name}${what ? ` · ${what.label}` : ''}${here ? ' — you are here' : ' — click to walk'}`}</title>
                    <rect width={TILE} height={TILE} rx={8}
                      fill={here ? '#ffb77d' : n.ghost ? 'rgba(43,42,40,0.35)' : '#2b2a28'}
                      stroke={here ? '#ffdcc3' : n.ghost ? '#6d5a4c' : '#4a4542'}
                      strokeWidth={here ? 2.5 : 1.25} strokeDasharray={n.ghost ? '3 3' : undefined} />
                    {(!n.ghost || what) && (
                      <text x={TILE / 2} y={TILE / 2 + 1} textAnchor="middle" dominantBaseline="central" className="msi" fontSize={20}
                        fill={here ? '#4d2600' : what?.color ?? '#cfc6bd'}>
                        {here ? 'my_location' : what?.icon ?? terrainIcon(r?.terrain ?? '')}
                      </text>
                    )}
                    {vertical && (
                      <text x={TILE - 2} y={8} textAnchor="end" fontSize={9} fontWeight={700} fontFamily="JetBrains Mono, monospace" fill={here ? '#4d2600' : '#ffb68e'}>{vertical}</text>
                    )}
                    {showNames && r && (
                      <text x={TILE / 2} y={TILE + 10} textAnchor="middle" fontSize={8} fill={here ? '#ffdcc3' : '#a38c7c'} fontFamily="Plus Jakarta Sans, sans-serif">
                        {r.name.length > 13 ? `${r.name.slice(0, 12).trimEnd()}…` : r.name}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}
