// Iron Realms tasks: the guided to-do list (IRE.Tasks GMCP), Achaea's nearest thing to quests.
//
//   IRE.Tasks.List   [{id, name, desc, type: "Task", cmd: "TASK 14 INFO", status: "0", group: "Active"}, …]
//   IRE.Tasks.Update the same shape, one task or a list: merged by id
//   IRE.Tasks.Completed  likewise: those tasks are done

export interface IreTask { id: string; name: string; desc: string; type: string; cmd: string; done: boolean; group: string }
export interface Tasks { list: IreTask[]; at: number; loading: boolean }

export const emptyTasks = (): Tasks => ({ list: [], at: 0, loading: false });

function toTask(raw: any, done?: boolean): IreTask | null {
  if (!raw || raw.id === undefined) return null;
  return {
    id: String(raw.id), name: String(raw.name ?? ''), desc: String(raw.desc ?? ''), type: String(raw.type ?? 'Task'),
    cmd: String(raw.cmd ?? ''), group: String(raw.group ?? ''),
    done: done ?? (String(raw.status ?? '0') !== '0'),
  };
}
const many = (data: any): any[] => (Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : []);

export function taskList(data: any): IreTask[] {
  return many(data).map((t) => toTask(t)).filter((t): t is IreTask => !!t);
}

/** Merge updated (or completed) tasks into the list; new ones are added. */
export function mergeTasks(list: IreTask[], data: any, completed = false): IreTask[] {
  const out = [...list];
  for (const raw of many(data)) {
    const i = out.findIndex((t) => t.id === String(raw?.id));
    const prev = i >= 0 ? out[i] : undefined;
    const t = toTask({ ...prev, status: prev?.done ? '1' : '0', ...raw }, completed ? true : undefined);
    if (!t) continue;
    if (i >= 0) out[i] = t; else out.push(t);
  }
  return out;
}

/** Groups in the game's order, with the active ones first. */
export function groupTasks(list: IreTask[]): { group: string; tasks: IreTask[] }[] {
  const groups: { group: string; tasks: IreTask[] }[] = [];
  for (const t of list) {
    const g = t.group || 'Other';
    let entry = groups.find((x) => x.group === g);
    if (!entry) groups.push(entry = { group: g, tasks: [] });
    entry.tasks.push(t);
  }
  return groups.sort((a, b) => Number(b.group === 'Active') - Number(a.group === 'Active'));
}
