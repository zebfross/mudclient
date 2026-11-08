import { useState } from 'react';
import { game, useGame } from '../lib/store.ts';
import { DEFAULT_QUICK, loadQuick, move, newId, quickLabel, saveQuick, splitCommands, type QuickAction } from '../lib/quick.ts';
import { Icon, NOT_A_LOGIN } from './ui.tsx';

const CHIP = 'px-2.5 py-1 rounded font-mono text-[11px] uppercase shrink-0 border';

/** The command bar's row of one-click actions. The pencil switches to editing. */
export function QuickBar() {
  const { connected } = useGame();
  const [list, setList] = useState<QuickAction[]>(loadQuick);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<QuickAction | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const update = (next: QuickAction[]) => { setList(next); saveQuick(next); };
  const run = (q: QuickAction) => game.commands(splitCommands(q.cmd));
  const saveDraft = () => {
    if (!draft || !splitCommands(draft.cmd).length) return;
    const clean = { ...draft, cmd: draft.cmd.trim(), label: draft.label.trim() };
    update(list.some((q) => q.id === clean.id) ? list.map((q) => (q.id === clean.id ? clean : q)) : [...list, clean]);
    setDraft(null);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-1.5">
      <div className={`flex-1 min-w-0 flex items-center gap-1.5 ${editing ? 'flex-wrap' : 'overflow-x-auto pb-0.5 scroll-thin'}`}>
        <span className="label-caps text-outline shrink-0 mr-1">Quick:</span>
        {list.map((q, i) => editing ? (
          <span
            key={q.id}
            draggable
            onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (dragFrom !== null) update(move(list, dragFrom, i)); setDragFrom(null); }}
            onDragEnd={() => setDragFrom(null)}
            className={`${CHIP} flex items-center gap-1 cursor-grab bg-surface-mid border-dashed ${
              draft?.id === q.id ? 'border-primary text-primary' : 'border-outline/50 text-on-surface-variant'} ${dragFrom === i ? 'opacity-40' : ''}`}
          >
            <Icon name="drag_indicator" className="text-xs text-outline" />
            <button type="button" onClick={() => setDraft({ ...q })} title={`Edit: ${q.cmd}`}>{quickLabel(q)}</button>
            <button type="button" onClick={() => { update(list.filter((x) => x.id !== q.id)); if (draft?.id === q.id) setDraft(null); }}
              aria-label={`Remove ${quickLabel(q)}`} title="Remove" className="text-outline hover:text-error">
              <Icon name="close" className="text-xs" />
            </button>
          </span>
        ) : (
          <button key={q.id} type="button" disabled={!connected} onClick={() => run(q)} title={q.label ? q.cmd : undefined}
            className={`${CHIP} bg-surface-mid hover:bg-surface-bright hover:text-primary border-surface-high/20 text-on-surface-variant`}>
            {quickLabel(q)}
          </button>
        ))}
        {editing && (
          <button type="button" onClick={() => setDraft({ id: newId(), label: '', cmd: '' })}
            className={`${CHIP} flex items-center gap-1 border-dashed border-primary/50 text-primary hover:bg-primary/10`}>
            <Icon name="add" className="text-xs" /> Add
          </button>
        )}
      </div>
        <span className="flex items-center gap-1 shrink-0">
          {editing && (
            <button type="button" onClick={() => { update(DEFAULT_QUICK); setDraft(null); }}
              title="Back to the default actions" className="font-mono text-[10px] uppercase text-outline hover:text-on-surface px-1">Reset</button>
          )}
          <button type="button" onClick={() => { setEditing(!editing); setDraft(null); }}
            aria-label={editing ? 'Done editing quick actions' : 'Edit quick actions'} title={editing ? 'Done' : 'Edit quick actions'}
            className={`p-1 rounded border ${editing ? 'bg-primary/20 text-primary border-primary/40' : 'text-outline border-surface-high/40 hover:text-on-surface'}`}>
            <Icon name={editing ? 'check' : 'edit'} className="text-sm" />
          </button>
        </span>
      </div>

      {editing && draft && (
        <form
          className="flex flex-wrap items-center gap-2 rounded border border-surface-high/40 bg-surface-low/95 p-2"
          onSubmit={(e) => { e.preventDefault(); saveDraft(); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setDraft(null); }}
        >
          <input
            {...NOT_A_LOGIN}
            autoFocus value={draft.cmd} onChange={(e) => setDraft({ ...draft, cmd: e.target.value })}
            placeholder="Command, e.g. get all corpse; sac corpse" aria-label="Quick action command" spellCheck={false}
            className="flex-[2_1_14rem] min-w-0 bg-surface-mid rounded px-2 py-1 font-mono text-xs border border-surface-high/40 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            {...NOT_A_LOGIN}
            value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder="Label (optional)" aria-label="Quick action label"
            className="flex-[1_1_8rem] min-w-0 bg-surface-mid rounded px-2 py-1 text-xs border border-surface-high/40 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button type="submit" className="btn btn-primary" disabled={!splitCommands(draft.cmd).length}>Save</button>
          <button type="button" className="btn" onClick={() => setDraft(null)}>Cancel</button>
          <p className="basis-full text-[10px] text-outline">Separate several commands with <span className="font-mono">;</span>. They're sent in order.</p>
        </form>
      )}
    </div>
  );
}
