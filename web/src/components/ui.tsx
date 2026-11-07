import type { ReactNode } from 'react';
import type { Seg } from '../lib/ansi.ts';

export const Icon = ({ name, className = '' }: { name: string; className?: string }) => (
  <span className={`msi ${className}`} aria-hidden>{name}</span>
);

export function SegText({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((s, i) =>
        s.fg || s.bg || s.b || s.u ? (
          <span key={i} style={{ color: s.fg, background: s.bg, fontWeight: s.b ? 700 : undefined, textDecoration: s.u ? 'underline' : undefined }}>
            {s.text}
          </span>
        ) : (
          s.text
        ),
      )}
    </>
  );
}

export function Bar({ value, max, className = 'bg-primary', track = 'bg-surface-highest', h = 'h-1.5' }: {
  value: number; max: number; className?: string; track?: string; h?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`w-full ${h} ${track} rounded-full overflow-hidden`} role="meter" aria-valuenow={value} aria-valuemax={max}>
      <div className={`${className} h-full transition-[width] duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function CardHead({ icon, title, right, iconClass = 'text-primary' }: {
  icon: string; title: string; right?: ReactNode; iconClass?: string;
}) {
  return (
    <div className="card-head">
      <div className="flex items-center gap-2 min-w-0">
        <Icon name={icon} className={`${iconClass} text-lg`} />
        <h2 className="font-display text-sm sm:text-base font-semibold tracking-wide text-on-surface truncate">{title}</h2>
      </div>
      {right}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="font-mono text-xs text-outline/80 italic py-2">{children}</p>;
}

// Lets any panel drop text into the command bar for the player to edit before sending.
export const fillCommand = (text: string) => window.dispatchEvent(new CustomEvent('fill-command', { detail: text }));

export { terrainIcon, terrainTint, guessTarget } from '../lib/roomText.ts';
