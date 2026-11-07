// Parsers for Aardwolf's objective commands: `goals`, `goal <name>`, `campaign check`, plus quest GMCP.

export interface GoalTask { n: number; text: string; status: string }
export interface Goal {
  name: string;
  description: string;
  level: number;
  rating: number;
  status: string;
  title?: string;
  details?: string;
  tasks?: GoalTask[];
}
export interface Campaign { active: boolean; lines: string[] }
export interface Quest { action: string; at: number; [k: string]: unknown }
export interface Objectives {
  goals: Goal[];
  campaign: Campaign | null;
  quest: Quest | null;
  at: number;
  loading: boolean;
}

export const emptyObjectives = (): Objectives => ({ goals: [], campaign: null, quest: null, at: 0, loading: false });

/** Rows of the `goals` table: "Academy      Graduate from the Aylorian Academy.     1      2   Open" */
export function parseGoalList(lines: string[]): Goal[] {
  const out: Goal[] = [];
  for (const l of lines) {
    const m = /^(\S+)\s{2,}(.+?)\s{2,}(\d+)\s+(\d+)\s*([A-Za-z][A-Za-z ]*)?\s*$/.exec(l);
    if (!m || m[1] === 'Goal') continue;
    out.push({ name: m[1], description: m[2].trim(), level: Number(m[3]), rating: Number(m[4]), status: (m[5] ?? '').trim() });
  }
  return out;
}

export const isActiveGoal = (g: Goal) => /^open$/i.test(g.status);

/** Output of `goal <name>`: title, description block, and a numbered task list. */
export function parseGoalDetail(lines: string[]): Pick<Goal, 'title' | 'details' | 'tasks'> {
  const title = lines.map((l) => /Goal information for:\s*(.+?)\s*$/.exec(l)?.[1]).find(Boolean);
  const rules = lines.map((l, i) => (/^~{10,}/.test(l.trim()) ? i : -1)).filter((i) => i >= 0);
  const details = rules.length >= 2
    ? lines.slice(rules[0] + 1, rules[1]).map((l) => l.trim()).join(' ').replace(/\s+/g, ' ').trim()
    : undefined;
  const tasks: GoalTask[] = [];
  for (const l of lines) {
    const m = /^\s*(\d+)\s+-\s+(.+?)\s+:\s*([A-Za-z][A-Za-z ]*?)\s*$/.exec(l);
    if (m) tasks.push({ n: Number(m[1]), text: m[2].trim(), status: m[3] });
  }
  return { title, details, tasks };
}

export function parseCampaign(lines: string[]): Campaign {
  const kept = lines.map((l) => l.trimEnd()).filter((l) => l.trim());
  return { active: !kept.some((l) => /not currently on a campaign/i.test(l)), lines: kept };
}

/** Fold a comm.quest GMCP event into the current quest state. */
export function applyQuestEvent(prev: Quest | null, data: Record<string, unknown>): Quest {
  const action = String(data.action ?? 'status');
  const now = Date.now();
  if (action === 'start') return { ...data, action, at: now };
  if (['comp', 'fail', 'timeout', 'reset'].includes(action)) {
    // Quest over: keep only what's useful afterwards (rewards, wait time).
    return { ...data, action, at: now };
  }
  return { ...(prev ?? {}), ...data, action, at: now };
}

const ENDED = new Set(['comp', 'fail', 'timeout', 'reset']);
/** On a quest right now (has a target and it hasn't ended). */
export const questActive = (q: Quest | null) => !!q && !!q.targ && !ENDED.has(q.action);
