import { useMemo } from 'react';
import { game, useGame } from '../lib/store.ts';
import { plain } from '../lib/ansi.ts';
import { DIR_NAMES } from '../lib/mapper.ts';
import { gridPath, key, labelGrid, parseAsciiMap, type GridCell } from '../lib/asciiMap.ts';
import { terrainIcon } from './ui.tsx';
import { BRACKET_TERRAIN, CONTENT_STYLE } from '../lib/mapStyle.ts';

const CELL = 40;
const TILE = 30;

const CONTENT_ICON: Record<string, [string, string]> = {
  '#': ['my_location', '#4d2600'],
  ...Object.fromEntries(Object.entries(CONTENT_STYLE).map(([c, v]) => [c, [v.icon, v.color] as [string, string]])),
};

/** Aardwolf's map, parsed into walkable tiles; known rooms are named, the rest are ghosts. */
export function GridMap() {
  const { asciiMap, room, mapVersion } = useGame();
  const grid = useMemo(() => parseAsciiMap(asciiMap.map(plain)), [asciiMap]);
  const ids = useMemo(() => (grid && room ? labelGrid(grid, room, game.mapper) : new Map<string, number>()), [grid, room, mapVersion]);
  if (!grid) return null;

  const xs = grid.cells.map((c) => c.x), ys = grid.cells.map((c) => c.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const w = (Math.max(...xs) - minX + 1) * CELL, h = (Math.max(...ys) - minY + 1) * CELL;
  const cx = (c: { x: number }) => (c.x - minX) * CELL + CELL / 2;
  const cy = (c: { y: number }) => (c.y - minY) * CELL + CELL / 2;

  const walk = (c: GridCell) => {
    if (c.x === 0 && c.y === 0) return;
    const path = gridPath(grid, c.x, c.y);
    if (path?.length) game.walk(path);
  };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} style={{ maxWidth: '100%', maxHeight: 340 }} role="img" aria-label="Map of nearby rooms">
      {grid.cells.flatMap((c) => (['e', 's'] as const).filter((d) => c.exits[d]).map((d) => {
        const nx = c.x + (d === 'e' ? 1 : 0), ny = c.y + (d === 's' ? 1 : 0);
        return <line key={`${c.x},${c.y},${d}`} x1={cx(c)} y1={cy(c)} x2={cx({ x: nx })} y2={cy({ y: ny })} stroke="#6d5a4c" strokeWidth={2.5} strokeLinecap="round" />;
      }))}
      {grid.cells.map((c) => {
        const here = c.x === 0 && c.y === 0;
        const id = ids.get(key(c.x, c.y));
        const known = id !== undefined ? game.mapper.rooms.get(id) ?? (here ? room : undefined) : undefined;
        const [icon, color] = CONTENT_ICON[c.contents] ?? [terrainIcon(known?.terrain ?? BRACKET_TERRAIN[c.terrain] ?? ''), known ? '#cfc6bd' : '#a38c7c'];
        const name = known?.name ?? (id !== undefined ? `Room #${id} (not visited)` : 'Unexplored room');
        const what = CONTENT_STYLE[c.contents] ? ` · ${CONTENT_STYLE[c.contents].label}` : '';
        return (
          <g key={key(c.x, c.y)} transform={`translate(${cx(c) - TILE / 2},${cy(c) - TILE / 2})`} onClick={() => walk(c)}
            className={here ? '' : 'cursor-pointer [&:hover>rect]:stroke-[#ffb77d]'}>
            <title>{`${name}${what}${here ? ' — you are here' : ' — click to walk'}`}</title>
            <rect width={TILE} height={TILE} rx={7}
              fill={here ? '#ffb77d' : known ? '#2b2a28' : 'rgba(43,42,40,0.35)'}
              stroke={here ? '#ffdcc3' : known ? '#4a4542' : '#6d5a4c'}
              strokeWidth={here ? 2 : 1.25}
              strokeDasharray={!here && !known ? '3 3' : undefined} />
            <text x={TILE / 2} y={TILE / 2 + 1} textAnchor="middle" dominantBaseline="central" className="msi" fontSize={17} fill={here ? '#4d2600' : color}>{icon}</text>
            {(c.up || c.down) && (
              <text x={TILE - 1} y={6} textAnchor="end" fontSize={8} fontWeight={700} fontFamily="JetBrains Mono, monospace" fill={here ? '#4d2600' : '#ffb68e'}>{`${c.up ? 'u' : ''}${c.down ? 'd' : ''}`}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
