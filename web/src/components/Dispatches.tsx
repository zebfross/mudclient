import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { game, isTellChan, parseTell, useGame, type ChatMsg } from '../lib/store.ts';
import { CardHead, Empty, Icon, SegText, NOT_A_LOGIN } from './ui.tsx';

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const GROUP_GAP = 3 * 60_000; // consecutive messages from one person within this share a label

/** Recipient is a player name, or "#channel" for a channel. */
function sendTo(recipient: string, text: string) {
  const r = recipient.trim();
  if (!r || !text.trim()) return false;
  game.command(r.startsWith('#') ? `${r.slice(1)} ${text}` : `tell ${r} ${text}`);
  return true;
}

export function Dispatches({ className = '', bare = false }: { className?: string; bare?: boolean }) {
  const { chat, connected } = useGame();
  const [filter, setFilter] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const listId = useId();

  const tells = useMemo(() => new Map(chat.map((c) => [c.id, parseTell(c)])), [chat]);
  const channels = useMemo(() => [...new Set(chat.map((c) => c.chan))].sort((a, b) => Number(isTellChan(b)) - Number(isTellChan(a))), [chat]);
  // Recent tell partners first (most recent first), then channels.
  const partners = useMemo(() => {
    const seen: string[] = [];
    for (let i = chat.length - 1; i >= 0; i--) {
      const t = tells.get(chat[i].id);
      if (t && !seen.some((s) => s.toLowerCase() === t.who.toLowerCase())) seen.push(t.who);
    }
    return seen;
  }, [chat, tells]);
  const chanTargets = channels.filter((c) => !isTellChan(c)).map((c) => `#${c}`);

  const [recipient, setRecipient] = useState('');
  const [draft, setDraft] = useState('');
  useEffect(() => { if (!recipient && partners[0]) setRecipient(partners[0]); }, [partners, recipient]);

  const shown = filter ? chat.filter((c) => c.chan === filter) : chat;
  useEffect(() => {
    if (pinned.current) ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [shown.length, filter]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (sendTo(recipient, draft)) { setDraft(''); pinned.current = true; }
  };

  const chip = (active: boolean) => `chip shrink-0 ${active ? 'bg-primary/20 text-primary border-primary/40' : 'text-outline border-surface-high/40 hover:text-on-surface'}`;

  return (
    <section className={`${bare ? '' : 'card p-4'} flex flex-col min-h-0 ${className}`}>
      <CardHead icon="forum" title="Dispatches" right={
        <button className="btn px-2" onClick={() => game.requestTellHistory()} title="Load tell history (tell -h)" aria-label="Load tell history">
          <Icon name="history" className="text-sm" />
        </button>
      } />
      {channels.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto scroll-thin pb-1 mb-2">
          <button className={chip(!filter)} onClick={() => setFilter(null)}>All</button>
          {channels.map((c) => <button key={c} className={chip(filter === c)} onClick={() => setFilter(c)}>{c}</button>)}
        </div>
      )}

      <div
        ref={ref}
        onScroll={(e) => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30; }}
        className="flex-1 min-h-24 overflow-y-auto scroll-thin flex flex-col gap-1 pr-1"
      >
        {shown.length === 0 ? <Empty>Channel chatter and tells appear here, and are kept between visits.</Empty> : shown.map((c, i) => {
          const t = tells.get(c.id);
          if (!t) return <ChannelLine key={c.id} c={c} onPick={(r) => setRecipient(r)} />;
          const next = shown[i + 1];
          const nt = next && tells.get(next.id);
          const lastOfRun = !nt || nt.dir !== t.dir || nt.who.toLowerCase() !== t.who.toLowerCase() || next.at - c.at > GROUP_GAP;
          const out = t.dir === 'out';
          return (
            <div key={c.id} className={`flex flex-col ${out ? 'items-end' : 'items-start'} ${lastOfRun ? 'mb-2' : ''}`}>
              <div
                onClick={() => { if (!window.getSelection()?.toString()) setRecipient(t.who); }}
                title={`Click to message ${t.who}`}
                className={`max-w-[85%] select-text cursor-text text-[13px] leading-snug px-3 py-2 rounded-2xl break-words whitespace-pre-wrap transition-colors ${
                  out
                    ? 'bg-primary/20 text-on-surface border border-primary/30 rounded-br-md hover:bg-primary/25'
                    : 'bg-surface-high/80 text-on-surface border border-surface-highest rounded-bl-md hover:bg-surface-highest'
                }`}
              >
                {t.text}
              </div>
              {lastOfRun && (
                <span className="font-mono text-[10px] text-outline mt-1 px-1">
                  {out ? <>To <span className="text-primary">{t.who}</span></> : <span className="text-tertiary">{t.who}</span>} · {time(c.at)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={send} className="mt-3 pt-3 border-t border-surface-high/40 flex flex-col gap-2">
        <label className="flex items-center gap-2 text-[11px] font-mono text-outline">
          <span className="label-caps">To</span>
          <input
            {...NOT_A_LOGIN}
            list={listId}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="name or #channel"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 min-w-0 bg-surface-mid rounded px-2 py-1 border border-surface-high/40 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Recipient"
          />
          <datalist id={listId}>
            {partners.map((p) => <option key={p} value={p} />)}
            {chanTargets.map((c) => <option key={c} value={c} />)}
          </datalist>
        </label>
        <div className="flex items-center gap-2">
          <input
            {...NOT_A_LOGIN}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={recipient ? (recipient.startsWith('#') ? `Say on ${recipient.slice(1)}…` : `Message ${recipient}…`) : 'Choose who to message'}
            disabled={!connected}
            autoComplete="off"
            className="flex-1 min-w-0 bg-surface-mid rounded-full px-3.5 py-2 text-sm border border-surface-high/40 text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            aria-label="Message"
          />
          <button type="submit" disabled={!connected || !recipient.trim() || !draft.trim()} aria-label="Send"
            className="w-9 h-9 shrink-0 rounded-full grid place-items-center bg-primary text-on-primary hover:bg-primary-fixed disabled:opacity-40 disabled:cursor-not-allowed">
            <Icon name="send" className="text-base" />
          </button>
        </div>
      </form>
    </section>
  );
}

function ChannelLine({ c, onPick }: { c: ChatMsg; onPick: (recipient: string) => void }) {
  return (
    <div className="font-mono text-[11.5px] leading-relaxed break-words py-0.5">
      <button className="chip mr-1.5 align-middle text-outline border-surface-high/40 hover:text-primary" onClick={() => onPick(`#${c.chan}`)} title={`Reply on ${c.chan}`}>
        {c.chan}
      </button>
      <SegText segs={c.msg} />
      <span className="text-outline-variant text-[10px] ml-1.5">{time(c.at)}</span>
    </div>
  );
}
