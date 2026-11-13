import { useEffect, useState } from 'react';
import { game, useGame } from '../lib/store.ts';
import { groupTasks, type IreTask } from '../lib/tasks.ts';
import { CardHead, Empty, Icon } from './ui.tsx';

const STALE_MS = 60_000;

/** Iron Realms tasks: what the game suggests doing next, grouped as the game groups them. */
export function TasksPanel() {
  const { tasks, loggedIn } = useGame();
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => { if (loggedIn && Date.now() - tasks.at > STALE_MS) game.refreshTasks(); }, [loggedIn]);

  const groups = groupTasks(tasks.list);
  const done = tasks.list.filter((t) => t.done).length;

  return (
    <section className="flex flex-col gap-4">
      <CardHead icon="task_alt" title="Tasks" right={
        <span className="flex items-center gap-2">
          {tasks.list.length > 0 && <span className="font-mono text-[11px] text-outline">{done}/{tasks.list.length} done</span>}
          <button className="btn px-2" onClick={() => game.refreshTasks()} disabled={!loggedIn || tasks.loading} title="Refresh tasks" aria-label="Refresh tasks">
            <Icon name="refresh" className={`text-sm ${tasks.loading ? 'animate-spin' : ''}`} />
          </button>
        </span>
      } />
      {!loggedIn ? <Empty>Log in to see your tasks.</Empty>
        : groups.length === 0 ? <Empty>{tasks.loading ? 'Reading your tasks…' : 'No tasks right now. Type "tasks" to check in the game.'}</Empty>
        : groups.map(({ group, tasks: list }) => {
          const active = group === 'Active';
          return (
            <div key={group} className={`rounded-lg border p-3 ${active ? 'border-primary/30 bg-primary/5' : 'border-surface-high/40 bg-surface-lowest/40'}`}>
              <div className={`flex items-center gap-2 mb-2 ${active ? 'text-primary' : 'text-outline'}`}>
                <Icon name={active ? 'flag' : 'folder_open'} className="text-base" />
                <span className="font-display text-sm font-semibold tracking-wide">{active ? 'Doing now' : group}</span>
                <span className="ml-auto font-mono text-[10px]">{list.filter((t) => t.done).length}/{list.length}</span>
              </div>
              <ul className="flex flex-col gap-1">
                {list.map((t) => <TaskRow key={t.id} task={t} open={open === t.id} toggle={() => setOpen(open === t.id ? null : t.id)} />)}
              </ul>
            </div>
          );
        })}
    </section>
  );
}

function TaskRow({ task: t, open, toggle }: { task: IreTask; open: boolean; toggle: () => void }) {
  return (
    <li>
      <button onClick={toggle} aria-expanded={open}
        className="w-full flex items-start gap-2 text-left rounded px-1.5 py-1 hover:bg-surface-high/30">
        <Icon name={t.done ? 'check_circle' : 'radio_button_unchecked'} className={`text-base mt-px ${t.done ? 'text-tertiary' : 'text-outline'}`} />
        <span className={`flex-1 text-sm ${t.done ? 'text-outline line-through' : 'text-on-surface'}`}>{t.name}</span>
        <Icon name={open ? 'expand_less' : 'expand_more'} className="text-base text-outline" />
      </button>
      {open && (
        <div className="ml-7 mr-1 mb-2 flex flex-col gap-2">
          {t.desc && <p className="text-xs text-on-surface-variant whitespace-pre-line leading-relaxed">{t.desc}</p>}
          {t.cmd && (
            <button className="btn self-start text-xs px-2 py-1" onClick={() => game.command(t.cmd.toLowerCase())} title={`Send "${t.cmd.toLowerCase()}"`}>
              <Icon name="info" className="text-sm" /> More in the game
            </button>
          )}
        </div>
      )}
    </li>
  );
}
