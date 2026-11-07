import { useEffect, useState } from 'react';
import { game, useGame } from '../lib/store.ts';
import { stripAard } from '../lib/aardColor.ts';
import { questActive, type Goal, type Quest } from '../lib/objectives.ts';
import { Bar, CardHead, Empty, Icon } from './ui.tsx';

const STALE_MS = 60_000;
const RATING = ['', 'Easy', 'Medium', 'Difficult', 'Very hard'];

/** Minutes left on a countdown the server gave us `at` some moment. */
function useMinutesLeft(minutes: unknown, at: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const m = Number(minutes);
  if (!Number.isFinite(m)) return null;
  return Math.max(0, Math.ceil(m - (now - at) / 60_000));
}

export function Objectives() {
  const { objectives: o, loggedIn } = useGame();

  // Refresh when the tab is opened with stale data.
  useEffect(() => { if (loggedIn && Date.now() - o.at > STALE_MS) game.refreshObjectives(); }, [loggedIn]);

  return (
    <section className="flex flex-col gap-4">
      <CardHead icon="flag" title="Objectives" right={
        <button className="btn px-2" onClick={() => game.refreshObjectives()} disabled={!loggedIn || o.loading} title="Refresh goals, quest and campaign" aria-label="Refresh objectives">
          <Icon name="refresh" className={`text-sm ${o.loading ? 'animate-spin' : ''}`} />
        </button>
      } />
      {!loggedIn ? <Empty>Log in to see your goals, quest and campaign.</Empty> : (
        <>
          <QuestCard quest={o.quest} />
          <CampaignCard />
          {o.goals.length === 0
            ? <Empty>{o.loading ? 'Reading your goals…' : 'No goals in progress. Type "goals" to browse them.'}</Empty>
            : o.goals.map((g) => <GoalCard key={g.name} goal={g} />)}
        </>
      )}
    </section>
  );
}

function Panel({ icon, title, tone = 'primary', children }: { icon: string; title: string; tone?: 'primary' | 'tertiary' | 'secondary' | 'muted'; children: React.ReactNode }) {
  const tones = {
    primary: 'border-primary/30 text-primary',
    tertiary: 'border-tertiary/30 text-tertiary',
    secondary: 'border-secondary/30 text-secondary',
    muted: 'border-surface-high/40 text-outline',
  };
  return (
    <div className={`rounded-lg border bg-surface-lowest/40 p-3 ${tones[tone].split(' ')[0]}`}>
      <div className={`flex items-center gap-2 mb-2 ${tones[tone].split(' ')[1]}`}>
        <Icon name={icon} className="text-base" />
        <span className="font-display text-sm font-semibold tracking-wide">{title}</span>
      </div>
      {children}
    </div>
  );
}

function QuestCard({ quest }: { quest: Quest | null }) {
  const active = questActive(quest);
  const left = useMinutesLeft(active ? quest?.timer : quest?.wait, quest?.at ?? 0);
  if (!quest) {
    return (
      <Panel icon="assignment" title="Quest" tone="muted">
        <p className="text-xs text-on-surface-variant">No quest info yet. <button className="text-primary hover:underline" onClick={() => game.command('quest info')}>Check status</button></p>
      </Panel>
    );
  }
  if (active) {
    const killed = quest.action === 'killed';
    return (
      <Panel icon="assignment" title="Quest" tone="primary">
        <p className="text-sm text-on-surface">
          {killed ? <>Target slain. Return to your questmaster.</> : <>Slay <span className="font-semibold text-primary">{stripAard(String(quest.targ))}</span></>}
        </p>
        {!killed && (
          <p className="text-xs text-on-surface-variant mt-1">
            {stripAard(String(quest.room ?? '?'))} <span className="text-outline">in</span> {stripAard(String(quest.area ?? '?'))}
          </p>
        )}
        {left !== null && (
          <div className="flex items-center gap-2 mt-2">
            <Icon name="timer" className="text-outline text-sm" />
            <span className="font-mono text-[11px] text-on-surface-variant">{left} min left</span>
          </div>
        )}
        <div className="flex gap-1.5 mt-3">
          <button className="btn" onClick={() => game.command('quest info')}>Info</button>
          {!killed && <button className="btn" onClick={() => game.command(`where ${stripAard(String(quest.targ)).split(' ').pop()}`)}>Where</button>}
        </div>
      </Panel>
    );
  }
  const ended = { comp: 'Quest complete!', fail: 'Quest failed.', timeout: 'Quest timed out.', reset: 'Quest timer reset.' }[quest.action];
  return (
    <Panel icon="assignment" title="Quest" tone={left ? 'muted' : 'tertiary'}>
      {ended && <p className="text-sm text-on-surface mb-1">{ended}{quest.qp ? <span className="text-tertiary"> +{String(quest.qp)} qp</span> : null}</p>}
      <p className="text-xs text-on-surface-variant">
        {left ? <>Next quest available in <span className="font-mono text-on-surface">{left} min</span>.</> : <>You can take a quest now. Find a questmaster and type <span className="font-mono text-primary">quest request</span>.</>}
      </p>
    </Panel>
  );
}

function CampaignCard() {
  const { objectives: { campaign } } = useGame();
  if (!campaign) return null;
  return (
    <Panel icon="swords" title="Campaign" tone={campaign.active ? 'secondary' : 'muted'}>
      <ul className="flex flex-col gap-0.5 font-mono text-[11.5px] text-on-surface-variant">
        {campaign.lines.map((l, i) => <li key={i} className="break-words">{l.trim()}</li>)}
      </ul>
    </Panel>
  );
}

function GoalCard({ goal }: { goal: Goal }) {
  const tasks = goal.tasks ?? [];
  const done = tasks.filter((t) => /complete/i.test(t.status)).length;
  const next = tasks.find((t) => !/complete/i.test(t.status));
  const [open, setOpen] = useState(false);
  return (
    <Panel icon="flag" title={goal.title ?? goal.name} tone="tertiary">
      <p className="text-xs text-on-surface-variant">{goal.description}</p>
      {tasks.length > 0 && (
        <>
          <div className="flex items-center gap-2 mt-3">
            <div className="flex-1"><Bar value={done} max={tasks.length} className="bg-tertiary-container" /></div>
            <span className="font-mono text-[10px] text-tertiary">{done}/{tasks.length}</span>
          </div>
          {next && (
            <div className="mt-3 rounded-md bg-tertiary/10 border border-tertiary/30 px-2.5 py-2">
              <div className="label-caps text-[9px] text-tertiary mb-0.5">Next</div>
              <div className="text-xs text-on-surface">{next.text}</div>
            </div>
          )}
          <button className="label-caps text-[9px] text-outline hover:text-on-surface mt-2 flex items-center gap-1" onClick={() => setOpen(!open)}>
            <Icon name={open ? 'expand_less' : 'expand_more'} className="text-sm" /> {open ? 'Hide' : 'All'} tasks
          </button>
          {open && (
            <ul className="mt-1.5 flex flex-col gap-1">
              {tasks.map((t) => {
                const complete = /complete/i.test(t.status);
                return (
                  <li key={t.n} className={`flex items-start gap-2 text-xs ${complete ? 'text-outline line-through decoration-outline/50' : 'text-on-surface'}`}>
                    <Icon name={complete ? 'check_circle' : 'radio_button_unchecked'} className={`text-sm mt-px ${complete ? 'text-tertiary' : 'text-outline'}`} />
                    <span>{t.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-surface-high/30">
        <span className="font-mono text-[10px] text-outline">Lvl {goal.level} · {RATING[goal.rating] ?? goal.rating}</span>
        <button className="label-caps text-[9px] text-primary hover:underline" onClick={() => game.command(`goal ${goal.name.toLowerCase()}`)}>Full details</button>
      </div>
    </Panel>
  );
}
