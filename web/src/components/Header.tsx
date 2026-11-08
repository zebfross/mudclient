import { useEffect, useState } from 'react';
import { game, useGame } from '../lib/store.ts';
import { stripAard } from '../lib/aardColor.ts';
import { Bar, Icon } from './ui.tsx';
import { GameClock } from './Sky.tsx';

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  return <span className="font-mono text-xs text-on-surface-variant">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>;
}

function Vital({ label, value, max, color, labelColor }: { label: string; value?: number; max?: number; color: string; labelColor: string }) {
  return (
    <div className="flex items-center gap-2" title={`${label} ${value ?? '?'} / ${max ?? '?'}`}>
      <span className={`label-caps text-[9px] ${labelColor}`}>{label}</span>
      <div className="w-16 lg:w-20"><Bar value={value ?? 0} max={max ?? 1} className={color} /></div>
      <span className="font-mono text-[10px] text-on-surface-variant tabular-nums w-14">{value ?? '–'}<span className="text-outline">/{max ?? '–'}</span></span>
    </div>
  );
}

// Aardwolf reports hunger and thirst as 0–100 in char.status, where 100 is full.
function fullness(kind: 'hunger' | 'thirst', v: number) {
  if (kind === 'hunger') return v >= 70 ? 'Well fed' : v >= 40 ? 'Peckish' : v >= 15 ? 'Hungry' : 'Starving';
  return v >= 70 ? 'Not thirsty' : v >= 40 ? 'A little thirsty' : v >= 15 ? 'Thirsty' : 'Dehydrated';
}

/** A small unlabelled meter: the icon says what it is, the tooltip says the rest. */
function Need({ kind, value }: { kind: 'hunger' | 'thirst'; value?: number }) {
  const v = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : undefined;
  const low = v !== undefined && v < 15, warn = v !== undefined && v < 40;
  const tone = low ? 'text-[#ff7b6b]' : warn ? 'text-secondary' : 'text-on-surface-variant';
  const bar = low ? 'bg-[#d4574a]' : warn ? 'bg-secondary' : kind === 'hunger' ? 'bg-[#c9a36a]' : 'bg-[#6aa9c9]';
  const what = kind === 'hunger' ? 'Food' : 'Drink';
  const tip = v === undefined ? `${what}: unknown` : `${what}: ${v}% · ${fullness(kind, v)}${warn ? (kind === 'hunger' ? ' (eat something)' : ' (drink something)') : ''}`;
  return (
    <div className={`flex items-center gap-1 ${low ? 'animate-pulse' : ''}`} title={tip} aria-label={tip}>
      <Icon name={kind === 'hunger' ? 'restaurant' : 'water_drop'} className={`text-sm ${tone}`} />
      <div className="w-8"><Bar value={v ?? 0} max={100} className={bar} /></div>
    </div>
  );
}

export function Header() {
  const s = useGame();
  const { base, vitals, maxstats, status, worth } = s.char;
  const name = base?.name ?? 'Wanderer';
  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-surface-lowest/95 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.85)] border-b border-surface-high/40">
      <div className="h-14 sm:h-16 max-w-7xl mx-auto px-4 lg:px-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Icon name="local_fire_department" className="text-primary text-2xl" />
          <div className="flex flex-col leading-none">
            <span className="font-display text-[16px] text-primary tracking-wide">Gaslamp</span>
            <span className="label-caps text-[8px] text-outline font-medium mt-1">Aardwolf Link</span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4 px-3.5 py-1.5 rounded border border-surface-high/30 bg-surface-lowest/40 shadow-inner">
          <div className="hidden xl:flex items-center gap-1.5 whitespace-nowrap" title="Your local time"><Icon name="schedule" className="text-outline text-sm" /><Clock /></div>
          <GameClock />
          <div className="hidden xl:block h-3.5 w-px bg-surface-high" />
          <Vital label="HP" value={vitals?.hp} max={maxstats?.maxhp} color="bg-[#d4574a]" labelColor="text-[#ff7b6b]" />
          <Vital label="MN" value={vitals?.mana} max={maxstats?.maxmana} color="bg-tertiary-container" labelColor="text-tertiary" />
          <Vital label="MV" value={vitals?.moves} max={maxstats?.maxmoves} color="bg-primary" labelColor="text-primary" />
          <Need kind="hunger" value={status?.hunger === undefined ? undefined : Number(status.hunger)} />
          <Need kind="thirst" value={status?.thirst === undefined ? undefined : Number(status.thirst)} />
          <div className="h-3.5 w-px bg-surface-high" />
          <div className="flex items-center gap-1" title="Gold on hand">
            <Icon name="monetization_on" className="text-secondary text-sm" />
            <span className="label-caps text-xs text-secondary tabular-nums">{worth?.gold?.toLocaleString() ?? '–'}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1 bg-surface-mid px-1.5 py-1 rounded border border-surface-high/30">
            <button className="p-1 text-on-surface-variant hover:text-primary" title="Score" onClick={() => game.command('score')}><Icon name="auto_stories" /></button>
            <button className="p-1 text-on-surface-variant hover:text-primary" title="Equipment" onClick={() => game.command('eq')}><Icon name="shield" /></button>
            {s.connected
              ? <button className="p-1 text-on-surface-variant hover:text-error" title="Disconnect" onClick={() => game.disconnect()}><Icon name="power_settings_new" /></button>
              : <button className="p-1 text-tertiary hover:text-primary" title="Connect" onClick={() => game.connect()}><Icon name="power" /></button>}
          </div>
          <div className="flex items-center gap-2.5">
            <div className="hidden lg:flex flex-col text-right">
              <span className="text-xs font-semibold leading-tight">{stripAard(name)}</span>
              <span className="label-caps text-[9px] text-outline font-medium">
                {base ? `Lvl ${status?.level ?? base.level ?? '?'} ${base.race ?? ''} ${base.class ?? ''}` : s.connected ? 'Connected' : 'Offline'}
              </span>
            </div>
            <div className={`w-8 h-8 rounded-full grid place-items-center ring-1 ${s.connected ? 'ring-primary/50 bg-primary/15' : 'ring-outline-variant bg-surface-mid'}`}>
              <span className="font-display text-sm text-primary">{stripAard(name).slice(0, 1)}</span>
            </div>
          </div>
        </div>
      </div>
      {/* Compact vitals strip for phones */}
      <div className="md:hidden grid grid-cols-3 gap-2 px-4 pb-2">
        <Bar value={vitals?.hp ?? 0} max={maxstats?.maxhp ?? 1} className="bg-[#d4574a]" />
        <Bar value={vitals?.mana ?? 0} max={maxstats?.maxmana ?? 1} className="bg-tertiary-container" />
        <Bar value={vitals?.moves ?? 0} max={maxstats?.maxmoves ?? 1} className="bg-primary" />
      </div>
    </header>
  );
}
