import { game, useGame } from '../lib/store.ts';
import { CardHead, Empty, Icon, SegText } from './ui.tsx';

/** Personal unread notes, for the tab badge. */
export function usePersonalUnread() {
  const { notes } = useGame();
  return notes.boards.find((b) => b.name.toLowerCase() === 'personal')?.unread ?? 0;
}

/** Aardwolf's note boards: your Personal notes by default, read right in the panel. */
export function Notes() {
  const { notes, loggedIn } = useGame();
  const { open, reading, forum, posts, boards, loading } = notes;
  const isForum = (name: string) => name.toLowerCase() === forum.toLowerCase();
  // Personal first, then any board with something unread.
  // `board` only lists boards with unread posts, so Personal and the open board are added when missing.
  const listed = [...boards];
  for (const name of ['Personal', forum]) {
    if (!listed.some((b) => b.name.toLowerCase() === name.toLowerCase())) listed.unshift({ num: -listed.length - 1, name, unread: 0, desc: '' });
  }
  const chips = listed.filter((b) => b.name.toLowerCase() === 'personal' || b.unread > 0 || isForum(b.name))
    .sort((a, b) => Number(b.name.toLowerCase() === 'personal') - Number(a.name.toLowerCase() === 'personal'));

  const refresh = (
    <button onClick={() => game.refreshNotes()} disabled={!loggedIn || loading} title="Check for new notes" aria-label="Refresh notes"
      className="p-1 rounded border text-outline border-surface-high/40 hover:text-on-surface disabled:opacity-50">
      <Icon name="refresh" className={`text-base ${loading ? 'animate-spin' : ''}`} />
    </button>
  );

  if (open) {
    return (
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button className="btn px-1.5" onClick={() => game.closeNote()} aria-label="Back to the list"><Icon name="arrow_back" className="text-sm" /></button>
          <h2 className="font-display text-base text-primary flex-1 min-w-0 truncate" title={open.subject}>{open.subject || '(no subject)'}</h2>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <dt className="label-caps text-[9px] text-outline self-center">From</dt><dd className="text-on-surface font-semibold">{open.from}</dd>
          <dt className="label-caps text-[9px] text-outline self-center">To</dt><dd className="text-on-surface-variant">{open.to}</dd>
          <dt className="label-caps text-[9px] text-outline self-center">Date</dt><dd className="text-on-surface-variant">{open.date}</dd>
          <dt className="label-caps text-[9px] text-outline self-center">Board</dt><dd className="text-on-surface-variant">{open.forum} · #{open.num}</dd>
        </dl>
        <div className="rounded-lg bg-surface-lowest/60 border border-surface-high/30 p-3 font-mono text-xs leading-relaxed text-on-surface-variant whitespace-pre-wrap break-words select-text">
          {open.body.length ? open.body.map((l, i) => <div key={i} className="min-h-[1lh]"><SegText segs={l} /></div>) : <span className="text-outline">(empty note)</span>}
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <CardHead icon="mail" title="Notes" right={refresh} />
      {!loggedIn ? <Empty>Log in to read your notes.</Empty> : (
        <>
          {chips.length > 0 && (
            <div className="flex gap-1.5 flex-wrap" role="tablist" aria-label="Note boards">
              {chips.map((b) => (
                <button key={b.num} role="tab" aria-selected={isForum(b.name)} onClick={() => !isForum(b.name) && game.refreshNotes(b.name)} title={b.desc}
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] ${
                    isForum(b.name) ? 'bg-primary/20 text-primary border-primary/40' : 'text-outline border-surface-high/40 hover:text-on-surface'}`}>
                  {b.name}
                  {b.unread > 0 && <span className={`font-mono text-[9px] rounded-full px-1 ${b.name.toLowerCase() === 'personal' ? 'bg-tertiary text-on-tertiary' : 'bg-surface-highest'}`}>{b.unread}</span>}
                </button>
              ))}
            </div>
          )}
          {posts.length === 0 ? (
            <Empty>{loading ? 'Reading the board…' : notes.at ? `No notes on ${forum}.` : 'Checking your notes…'}</Empty>
          ) : (
            <ul className="flex flex-col gap-1">
              {posts.map((p) => (
                <li key={p.num}>
                  <button onClick={() => game.readNote(p.num)} disabled={reading !== undefined}
                    className={`w-full text-left rounded px-2.5 py-2 flex items-start gap-2 border transition-colors ${
                      p.unread ? 'bg-tertiary/10 border-tertiary/30 hover:bg-tertiary/15' : 'bg-surface-mid/50 border-transparent hover:bg-surface-mid'}`}>
                    <Icon name={reading === p.num ? 'progress_activity' : p.unread ? 'mark_email_unread' : 'drafts'}
                      className={`text-base mt-0.5 ${reading === p.num ? 'animate-spin text-primary' : p.unread ? 'text-tertiary' : 'text-outline'}`} />
                    <span className="flex-1 min-w-0">
                      <span className={`block text-xs truncate ${p.unread ? 'font-semibold text-on-surface' : 'text-on-surface-variant'}`}>{p.subject || '(no subject)'}</span>
                      <span className="block font-mono text-[10px] text-outline">{p.author} · {p.date}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-outline">Opening a note marks it read in the game. To write one, use <span className="font-mono">note write</span> in the command line.</p>
        </>
      )}
    </section>
  );
}
