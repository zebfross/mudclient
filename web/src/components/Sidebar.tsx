import { useEffect, useState, type ReactNode } from 'react';
import { isTellChan, useGame } from '../lib/store.ts';
import { Automap } from './Automap.tsx';
import { Curios, Souls } from './Room.tsx';
import { Group, Satchel } from './Panels.tsx';
import { Dispatches } from './Dispatches.tsx';
import { Objectives } from './Objectives.tsx';
import { TasksPanel } from './Tasks.tsx';
import { Notes, usePersonalUnread } from './Notes.tsx';
import { LasertagPanel, useInArena } from './Lasertag.tsx';
import { questActive } from '../lib/objectives.ts';
import { Icon } from './ui.tsx';
import { adapterFor, type Features } from '../lib/games/index.ts';

// Tabs that only make sense in games with the matching feature.
const TAB_FEATURE: Partial<Record<TabId, keyof Features>> = { goals: 'objectives', tasks: 'tasks', notes: 'notes', laser: 'lasertag' };

type TabId = 'objects' | 'satchel' | 'goals' | 'tasks' | 'souls' | 'chat' | 'notes' | 'laser';
const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'objects', icon: 'category', label: 'Curios & Objects' },
  { id: 'satchel', icon: 'work', label: 'Satchel' },
  { id: 'goals', icon: 'flag', label: 'Objectives' },
  { id: 'tasks', icon: 'task_alt', label: 'Tasks' },
  { id: 'souls', icon: 'group', label: 'Souls Present' },
  { id: 'chat', icon: 'forum', label: 'Dispatches' },
  { id: 'notes', icon: 'mail', label: 'Notes' },
  { id: 'laser', icon: 'target', label: 'Lasertag' },
];
const TAB_KEY = 'gaslamp.sidebarTab';

function loadTab(): TabId {
  try {
    const t = localStorage.getItem(TAB_KEY);
    if (TABS.some((x) => x.id === t)) return t as TabId;
  } catch { /* storage unavailable */ }
  return 'objects';
}

/** Map pinned on top, icon-tabbed panels below. */
export function Sidebar({ className = '' }: { className?: string }) {
  const { chat, roomObjs, roomChars, inventory, objectives, lasertag, mud, tasks } = useGame();
  const features = adapterFor(mud.family).features;
  const tabs = TABS.filter((t) => !TAB_FEATURE[t.id] || features[TAB_FEATURE[t.id]!]);
  const inArena = useInArena();
  const notesUnread = usePersonalUnread();
  const [chosen, setTab] = useState<TabId>(loadTab);
  const tab = tabs.some((t) => t.id === chosen) ? chosen : 'objects';
  const [seenChat, setSeenChat] = useState(chat.length);

  useEffect(() => { if (tab === 'chat') setSeenChat(chat.length); }, [tab, chat.length]);
  // Entering the arena brings the Lasertag tab forward.
  useEffect(() => { if (inArena) setTab('laser'); }, [inArena]);
  const choose = (t: TabId) => {
    setTab(t);
    try { localStorage.setItem(TAB_KEY, t); } catch { /* ignore */ }
  };

  const unread = chat.slice(seenChat);
  const counts: Record<TabId, number> = {
    objects: roomObjs.length,
    satchel: inventory.filter((i) => i.wearLoc === -1).length,
    goals: objectives.goals.length + (questActive(objectives.quest) ? 1 : 0) + (objectives.campaign?.active ? 1 : 0),
    tasks: tasks.list.filter((t) => !t.done && t.group === 'Active').length,
    souls: roomChars.length,
    chat: unread.length,
    notes: notesUnread,
    laser: lasertag.targets.length,
  };
  const tellWaiting = unread.some((c) => isTellChan(c.chan));

  const body: Record<TabId, ReactNode> = {
    objects: <Curios bare />,
    satchel: <Satchel bare />,
    goals: <Objectives />,
    tasks: <TasksPanel />,
    souls: <div className="flex flex-col gap-4"><Souls bare /><Group /></div>,
    chat: <Dispatches bare className="h-full" />,
    notes: <Notes />,
    laser: <LasertagPanel />,
  };

  return (
    <div className={`flex flex-col gap-4 min-h-0 ${className}`}>
      <Automap />
      <section className="card flex flex-col flex-1 min-h-[22rem] overflow-hidden">
        <div role="tablist" aria-label="Sidebar panels" className="flex border-b border-surface-high/40 bg-surface-lowest/60">
          {tabs.map((t) => {
            const active = tab === t.id;
            const n = counts[t.id];
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                aria-label={t.label}
                title={t.label}
                onClick={() => choose(t.id)}
                className={`relative flex-1 py-2.5 grid place-items-center transition-colors border-b-2 ${
                  active ? 'text-primary border-primary bg-primary/10' : 'text-outline border-transparent hover:text-on-surface hover:bg-surface-high/30'
                }`}
              >
                <Icon name={t.icon} className="text-xl" />
                {n > 0 && (t.id !== 'chat' || !active) && (
                  <span className={`absolute top-1 right-[calc(50%-1.4rem)] min-w-4 h-4 px-1 rounded-full text-[9px] font-mono font-bold grid place-items-center ${
                    t.id === 'chat' ? (tellWaiting ? 'bg-tertiary text-on-tertiary' : 'bg-primary text-on-primary') : t.id === 'notes' ? 'bg-tertiary text-on-tertiary' : 'bg-surface-highest text-on-surface-variant'
                  }`}>{n > 99 ? '99+' : n}</span>
                )}
              </button>
            );
          })}
        </div>
        <div role="tabpanel" className="flex-1 min-h-0 overflow-y-auto scroll-thin p-4">
          {body[tab]}
        </div>
      </section>
    </div>
  );
}
