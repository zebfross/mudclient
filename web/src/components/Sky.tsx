import { useMemo } from 'react';
import { useGame } from '../lib/store.ts';
import { formatDate, formatHour, phaseOf, type Phase } from '../lib/gameTime.ts';
import { Icon } from './ui.tsx';

export const PHASE_ICON: Record<Phase, [string, string]> = {
  dawn: ['wb_twilight', '#ffb68e'],
  day: ['light_mode', '#ffd479'],
  dusk: ['wb_twilight', '#e09be6'],
  night: ['dark_mode', '#8cb8f0'],
};

/** Header readout: game hour with a sun/moon icon; the calendar on hover. */
export function GameClock() {
  const { clock } = useGame();
  if (clock.hour === undefined) return null;
  const phase = phaseOf(clock.hour);
  const [icon, color] = PHASE_ICON[phase];
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap" title={`${formatDate(clock)}\nGame time: one hour passes every tick (about 30 seconds).`}>
      <Icon name={icon} className="text-sm" style={{ color }} />
      <span className="font-mono text-xs text-on-surface-variant">{formatHour(clock.hour)}</span>
    </div>
  );
}

const PHASES: Phase[] = ['night', 'dawn', 'day', 'dusk'];

/**
 * The sky behind everything, following the game clock: a sun that crosses the top of the page by
 * day, warm horizons at dawn and dusk, and stars with a moon at night. Layers cross-fade.
 */
export function Sky() {
  const { clock } = useGame();
  const hour = clock.hour;
  const phase = hour === undefined ? null : phaseOf(hour);
  // Sun from 6 to 19, moon from 19 to 6: left edge to right edge across their span.
  const across = hour === undefined ? 0.5
    : hour >= 6 && hour < 19 ? (hour - 6) / 13
    : ((hour + 24 - 19) % 24) / 11;
  const stars = useMemo(() => Array.from({ length: 110 }, (_, i) => {
    const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1; // stable pseudo-random
    return { x: r(1) * 100, y: r(2) * 70, s: 0.8 + r(3) * 1.4, d: r(4) * 6 };
  }), []);

  return (
    <div className="sky" aria-hidden data-phase={phase ?? 'none'} style={{ ['--across' as string]: `${8 + across * 84}%` }}>
      {PHASES.map((p) => <div key={p} className={`sky-layer sky-${p}`} style={{ opacity: phase === p ? 1 : 0 }} />)}
      <svg className="sky-stars" style={{ opacity: phase === 'night' ? 1 : phase === 'dusk' || phase === 'dawn' ? 0.35 : 0 }} width="100%" height="100%">
        {stars.map((s, i) => <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.s} fill="#e6e1df" style={{ animationDelay: `${s.d}s` }} />)}
      </svg>
    </div>
  );
}
