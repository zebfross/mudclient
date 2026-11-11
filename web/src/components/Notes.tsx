import { useEffect, useState } from 'react';
import { gameKey } from '../lib/gameChoice.ts';
import { game, useGame, type NoteDraft } from '../lib/store.ts';
import { stripAard } from '../lib/aardColor.ts';
import { CardHead, Empty, Icon, NOT_A_LOGIN, SegText } from './ui.tsx';

const DRAFT_KEY = gameKey('gaslamp.noteDraft');
const loadDraft = (): NoteDraft | null => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null'); } catch { return null; } };
const saveDraft = (d: NoteDraft | null) => { try { if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); else localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } };

const STAGE_TEXT: Record<string, string> = {
  starting: 'Switching to the Personal board…', to: 'Opening the note editor…', subject: 'Setting the subject…',
  checking: 'Checking the editor is ready…', body: 'Writing the note…', posting: 'Posting…',
};
const FIELD = 'bg-surface-mid rounded px-2.5 py-1.5 text-xs border border-surface-high/40 focus:outline-none focus:ring-1 focus:ring-primary';

/** Write a note on the Personal board. Addressed to yourself it's a private reminder. */
function Compose({ initial, onClose }: { initial: NoteDraft; onClose: () => void }) {
  const { notes, char } = useGame();
  const me = stripAard(char.base?.name ?? '');
  const [d, setD] = useState<NoteDraft>(initial);
  const compose = notes.compose;
  const busy = !!compose && compose.stage !== 'error' && compose.stage !== 'posted';
  useEffect(() => { if (!busy) saveDraft(d); }, [d, busy]);
  useEffect(() => {
    if (compose?.stage !== 'posted') return;
    saveDraft(null);
    const t = setTimeout(() => { game.clearCompose(); onClose(); }, 1200);
    return () => clearTimeout(t);
  }, [compose?.stage]);
  const toSelf = !!me && d.to.trim().toLowerCase() === me.toLowerCase();
  const ready = d.to.trim() && d.subject.trim() && d.body.trim();

  return (
    <form className="flex flex-col gap-2.5" onSubmit={(e) => { e.preventDefault(); if (ready && !busy) game.writeNote(d); }}>
      <div className="flex items-center gap-2">
        <button type="button" className="btn px-1.5" onClick={() => { game.clearCompose(); onClose(); }} disabled={busy} aria-label="Back to the list"><Icon name="arrow_back" className="text-sm" /></button>
        <h2 className="font-display text-base text-primary flex-1">New personal note</h2>
      </div>
      <label className="flex flex-col gap-1">
        <span className="label-caps text-[9px] text-outline flex items-center gap-2">To
          {me && !toSelf && <button type="button" className="normal-case tracking-normal text-[10px] text-primary hover:underline" onClick={() => setD({ ...d, to: me })} disabled={busy}>myself</button>}
        </span>
        <input {...NOT_A_LOGIN} value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} disabled={busy} spellCheck={false} placeholder="A player's name" className={FIELD} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label-caps text-[9px] text-outline">Subject</span>
        <input {...NOT_A_LOGIN} value={d.subject} maxLength={60} onChange={(e) => setD({ ...d, subject: e.target.value })} disabled={busy} className={FIELD} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label-caps text-[9px] text-outline">Note</span>
        <textarea {...NOT_A_LOGIN} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} disabled={busy} rows={9}
          className={`${FIELD} font-mono leading-relaxed resize-y min-h-[8rem]`} />
      </label>
      <p className="text-[10px] text-outline">
        {toSelf ? 'Only you will see this note: it waits on your Personal board.' : `This is sent to ${d.to.trim() || 'the player'} through Aardwolf, and lands on their Personal board.`}
        {' '}Long lines are wrapped for you.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex-1" />
        {busy ? (
          <>
            <span className="text-xs text-primary flex items-center gap-1.5"><Icon name="progress_activity" className="text-sm animate-spin" />{STAGE_TEXT[compose!.stage]}</span>
            <button type="button" className="btn" onClick={() => game.cancelNoteWrite()}>Cancel</button>
          </>
        ) : compose?.stage === 'posted' ? (
          <span className="text-xs text-tertiary flex items-center gap-1.5"><Icon name="check_circle" className="text-sm" />Posted</span>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={!ready}><Icon name="send" className="text-sm" /> {toSelf ? 'Save note' : 'Send note'}</button>
        )}
      </div>
      {compose?.stage === 'error' && <p className="text-xs text-[#ff7b6b] flex items-start gap-1.5"><Icon name="error" className="text-sm" />{compose.error}</p>}
    </form>
  );
}

/** Personal unread notes, for the tab badge. */
export function usePersonalUnread() {
  const { notes } = useGame();
  return notes.boards.find((b) => b.name.toLowerCase() === 'personal')?.unread ?? 0;
}

/** Aardwolf's note boards: your Personal notes by default, read right in the panel. */
export function Notes() {
  const { notes, loggedIn, char } = useGame();
  const [writing, setWriting] = useState<NoteDraft | null>(null);
  const me = stripAard(char.base?.name ?? '');
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

  const write = (
    <button onClick={() => setWriting(loadDraft() ?? { to: me, subject: '', body: '' })} disabled={!loggedIn} title="Write a note"
      className="btn px-2 py-0.5 text-[11px]"><Icon name="edit_note" className="text-sm" /> Write</button>
  );

  if (writing) return <section className="flex flex-col gap-3"><Compose initial={writing} onClose={() => setWriting(null)} /></section>;

  if (open) {
    return (
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button className="btn px-1.5" onClick={() => game.closeNote()} aria-label="Back to the list"><Icon name="arrow_back" className="text-sm" /></button>
          <h2 className="font-display text-base text-primary flex-1 min-w-0 truncate" title={open.subject}>{open.subject || '(no subject)'}</h2>
          <button className="btn px-2 py-0.5 text-[11px]" disabled={!loggedIn} title={`Write a note back to ${open.from}`}
            onClick={() => setWriting({ to: open.from, subject: /^re:/i.test(open.subject) ? open.subject : `Re: ${open.subject}`, body: '' })}>
            <Icon name="reply" className="text-sm" /> Reply
          </button>
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
      <CardHead icon="mail" title="Notes" right={<span className="flex items-center gap-1.5">{write}{refresh}</span>} />
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
          <p className="text-[10px] text-outline">Opening a note marks it read in the game. Write one to yourself for a private reminder.</p>
        </>
      )}
    </section>
  );
}
