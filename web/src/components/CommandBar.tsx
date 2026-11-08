import { useEffect, useRef, useState } from 'react';
import { game, useGame } from '../lib/store.ts';
import { Icon, NOT_A_LOGIN } from './ui.tsx';
import { QuickBar } from './QuickBar.tsx';
import { searchHistory } from '../lib/history.ts';

const HISTORY_KEY = 'gaslamp.history.v1';

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
}

function Highlight({ text, query }: { text: string; query: string }) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="bg-primary/25 text-primary rounded-sm">{text.slice(i, i + query.length)}</mark>{text.slice(i + query.length)}</>;
}

interface Search { query: string; idx: number; saved: string }

export function CommandBar() {
  const { localEcho, connected } = useGame();
  const [value, setValue] = useState('');
  const [search, setSearch] = useState<Search | null>(null);
  const history = useRef<string[]>(loadHistory());
  const matches = search ? searchHistory(history.current, search.query) : [];
  const current = search ? matches[Math.min(search.idx, matches.length - 1)] : undefined;
  const pos = useRef(-1);
  const input = useRef<HTMLInputElement>(null);

  // Never leave a typed command sitting in the box when the server switches to password entry.
  useEffect(() => { if (!localEcho) { setValue(''); setSearch(null); } }, [localEcho]);

  useEffect(() => {
    const fill =(e: Event) => { setValue((e as CustomEvent<string>).detail); input.current?.focus(); };
    window.addEventListener('fill-command', fill);
    // Typing anywhere on the page goes to the command line, like a desktop MUD client.
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      // Ctrl+R from anywhere opens history search (and never reloads the page).
      if (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'r' && t !== input.current) {
        e.preventDefault();
        input.current?.focus();
        startSearch.current();
        return;
      }
      if (t === input.current || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length === 1) input.current?.focus();
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('fill-command', fill); window.removeEventListener('keydown', key); };
  }, []);

  const startSearch = useRef(() => {});
  startSearch.current = () => {
    if (!localEcho) return;
    setSearch((s) => s ?? { query: '', idx: 0, saved: value });
  };
  const endSearch = (next: string | null) => {
    setValue(next ?? search?.saved ?? '');
    setSearch(null);
    pos.current = -1;
    requestAnimationFrame(() => input.current?.focus());
  };

  const run = (cmd: string) => {
    game.command(cmd);
    if (localEcho && cmd.trim() && history.current[0] !== cmd) {
      history.current = [cmd, ...history.current].slice(0, 200);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.current)); } catch { /* ignore */ }
    }
    pos.current = -1;
    // Keep the last command selected (classic MUD-client behaviour) unless it was a password.
    if (localEcho) { setValue(cmd); requestAnimationFrame(() => input.current?.select()); }
    else setValue('');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (search) {
      const cmd = current ?? '';
      setSearch(null);
      if (cmd) run(cmd);
      return;
    }
    run(value);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const ctrl = e.ctrlKey && !e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      // Again while searching: step to the next older match, like bash.
      if (search) setSearch({ ...search, idx: Math.min(search.idx + 1, Math.max(0, matches.length - 1)) });
      else startSearch.current();
      return;
    }
    if (search) {
      if (e.key === 'Escape' || (ctrl && /^[gc]$/i.test(e.key))) { e.preventDefault(); endSearch(null); return; }
      if (e.key === 'ArrowUp' || (ctrl && e.key.toLowerCase() === 's') || e.key === 'ArrowDown') {
        e.preventDefault();
        const older = e.key === 'ArrowUp';
        setSearch({ ...search, idx: Math.max(0, Math.min(matches.length - 1, search.idx + (older ? 1 : -1))) });
        return;
      }
      // Tab / → / ← take the match onto the line for editing.
      if (e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); endSearch(current ?? search.query); return; }
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const h = history.current;
      pos.current = Math.max(-1, Math.min(h.length - 1, pos.current + (e.key === 'ArrowUp' ? 1 : -1)));
      setValue(pos.current < 0 ? '' : h[pos.current]);
    }
  };

  return (
    <div className="sticky bottom-3 z-40 backdrop-blur-md rounded-xl p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.85)] border border-surface-high/40 flex flex-col gap-2 bg-surface-lowest/80">
      <QuickBar />
      {search && (
        <div className="rounded border border-surface-high/40 bg-surface-low/95 p-1.5">
          <div className="flex items-center justify-between px-1.5 pb-1">
            <span className="label-caps text-outline">reverse-i-search</span>
            <span className="font-mono text-[10px] text-outline">↵ run · Tab edit · ^R older · Esc cancel</span>
          </div>
          {matches.length === 0 ? (
            <p className="px-1.5 py-1 font-mono text-xs text-outline">{search.query ? `No match for “${search.query}”` : 'No history yet.'}</p>
          ) : (
            <ul className="flex flex-col-reverse max-h-48 overflow-y-auto scroll-thin">
              {matches.slice(0, 8).map((m, i) => (
                <li key={m}>
                  <button type="button"
                    // mousedown so the input doesn't blur first
                    onMouseDown={(e) => { e.preventDefault(); endSearch(m); }}
                    className={`w-full text-left px-1.5 py-0.5 rounded font-mono text-xs truncate ${m === current ? 'bg-surface-high text-on-surface' : 'text-on-surface-variant hover:bg-surface-mid'}`}>
                    <Highlight text={m} query={search.query} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <form className="flex items-center gap-2 sm:gap-3" onSubmit={submit}>
        <label className="flex-1 flex items-center bg-surface-mid rounded px-3 py-2 border border-surface-high/40 shadow-inner focus-within:ring-1 focus-within:ring-primary">
          <span className="font-mono text-primary mr-2 font-bold select-none">{search ? <Icon name="history" className="text-sm" /> : localEcho ? '>_' : <Icon name="lock" className="text-sm" />}</span>
          <input
            // A different element for the password: once a field has been type=password, password
            // managers keep treating it as one and offer to "update" the password on every command.
            key={localEcho ? 'command' : 'password'}
            ref={input}
            autoFocus
            {...(localEcho ? NOT_A_LOGIN : { autoComplete: 'current-password' })}
            autoCapitalize="off"
            spellCheck={false}
            type={localEcho ? 'text' : 'password'}
            value={search ? search.query : value}
            onChange={(e) => {
              if (search) setSearch({ ...search, query: e.target.value, idx: 0 });
              else { setValue(e.target.value); pos.current = -1; }
            }}
            onBlur={() => search && endSearch(current ?? search.saved)}
            onKeyDown={onKey}
            className="w-full bg-transparent text-on-surface font-mono text-sm font-semibold tracking-wide placeholder:text-outline placeholder:font-normal focus:outline-none"
            placeholder={search ? 'Search history…' : connected ? (localEcho ? "Enter command (e.g. 'look', 'north', 'kill rat')…  Ctrl+R to search" : 'Password') : 'Disconnected'}
            aria-label={search ? 'Search command history' : 'Command'}
          />
        </label>
        <button type="submit" className="bg-gradient-to-r from-primary-container to-primary hover:to-primary-fixed text-on-primary label-caps px-4 sm:px-5 py-2.5 rounded shadow-lg flex items-center gap-1.5 active:translate-y-0.5 shrink-0">
          <Icon name="send" className="text-sm" /><span className="hidden sm:inline">Execute</span>
        </button>
      </form>
    </div>
  );
}
