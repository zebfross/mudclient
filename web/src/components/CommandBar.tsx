import { useEffect, useRef, useState } from 'react';
import { game, useGame } from '../lib/store.ts';
import { Icon } from './ui.tsx';

const QUICK = ['look', 'score', 'where', 'quest info', 'campaign check', 'affects', 'scan', 'recall'];
const HISTORY_KEY = 'gaslamp.history.v1';

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
}

export function CommandBar() {
  const { localEcho, connected } = useGame();
  const [value, setValue] = useState('');
  const history = useRef<string[]>(loadHistory());
  const pos = useRef(-1);
  const input = useRef<HTMLInputElement>(null);

  // Never leave a typed command sitting in the box when the server switches to password entry.
  useEffect(() => { if (!localEcho) setValue(''); }, [localEcho]);

  useEffect(() => {
    const fill =(e: Event) => { setValue((e as CustomEvent<string>).detail); input.current?.focus(); };
    window.addEventListener('fill-command', fill);
    // Typing anywhere on the page goes to the command line, like a desktop MUD client.
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t === input.current || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length === 1) input.current?.focus();
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('fill-command', fill); window.removeEventListener('keydown', key); };
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    game.command(value);
    if (localEcho && value.trim() && history.current[0] !== value) {
      history.current = [value, ...history.current].slice(0, 200);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.current)); } catch { /* ignore */ }
    }
    pos.current = -1;
    // Keep the last command selected (classic MUD-client behaviour) unless it was a password.
    if (localEcho) requestAnimationFrame(() => input.current?.select());
    else setValue('');
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const h = history.current;
      pos.current = Math.max(-1, Math.min(h.length - 1, pos.current + (e.key === 'ArrowUp' ? 1 : -1)));
      setValue(pos.current < 0 ? '' : h[pos.current]);
    }
  };

  return (
    <div className="sticky bottom-3 z-40 backdrop-blur-md rounded-xl p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.85)] border border-surface-high/40 flex flex-col gap-2 bg-surface-lowest/80">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scroll-thin">
        <span className="label-caps text-outline shrink-0 mr-1">Quick:</span>
        {QUICK.map((q) => (
          <button key={q} className="bg-surface-mid hover:bg-surface-bright hover:text-primary px-2.5 py-1 rounded font-mono text-[11px] uppercase shrink-0 border border-surface-high/20 text-on-surface-variant"
            onClick={() => game.command(q)} disabled={!connected}>{q}</button>
        ))}
      </div>
      <form className="flex items-center gap-2 sm:gap-3" onSubmit={submit}>
        <label className="flex-1 flex items-center bg-surface-mid rounded px-3 py-2 border border-surface-high/40 shadow-inner focus-within:ring-1 focus-within:ring-primary">
          <span className="font-mono text-primary mr-2 font-bold select-none">{localEcho ? '>_' : <Icon name="lock" className="text-sm" />}</span>
          <input
            ref={input}
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            type={localEcho ? 'text' : 'password'}
            value={value}
            onChange={(e) => { setValue(e.target.value); pos.current = -1; }}
            onKeyDown={onKey}
            className="w-full bg-transparent text-on-surface font-mono text-sm font-semibold tracking-wide placeholder:text-outline placeholder:font-normal focus:outline-none"
            placeholder={connected ? (localEcho ? "Enter command (e.g. 'look', 'north', 'kill rat')…" : 'Password') : 'Disconnected'}
            aria-label="Command"
          />
        </label>
        <button type="submit" className="bg-gradient-to-r from-primary-container to-primary hover:to-primary-fixed text-on-primary label-caps px-4 sm:px-5 py-2.5 rounded shadow-lg flex items-center gap-1.5 active:translate-y-0.5 shrink-0">
          <Icon name="send" className="text-sm" /><span className="hidden sm:inline">Execute</span>
        </button>
      </form>
    </div>
  );
}
