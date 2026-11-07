import { useEffect, useMemo, useRef, useState } from 'react';
import { game, useGame, type InvItem } from '../lib/store.ts';
import { DIR_NAMES } from '../lib/mapper.ts';
import { stripAard } from '../lib/aardColor.ts';
import { Bar, CardHead, Empty, Icon, SegText, fillCommand } from './ui.tsx';

// ---- Group ------------------------------------------------------------------
export function Group() {
  const { group } = useGame();
  if (!group || group.members.length < 2) return null;
  return (
    <section className="card p-4">
      <CardHead icon="diversity_3" iconClass="text-tertiary" title={group.groupname || 'Fellowship'} />
      <ul className="flex flex-col gap-2">
        {group.members.map((m) => {
          const i = m.info as Record<string, number>;
          return (
            <li key={m.name} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-center">
              <span className="text-xs font-semibold truncate">{stripAard(m.name)} <span className="text-outline font-normal">L{i.lvl}</span></span>
              <span className="font-mono text-[10px] text-outline">{i.here ? 'here' : 'away'}</span>
              <div className="col-span-2 grid grid-cols-3 gap-1.5">
                <Bar value={i.hp} max={i.mhp} className="bg-[#d4574a]" />
                <Bar value={i.mn} max={i.mmn} className="bg-tertiary-container" />
                <Bar value={i.mv} max={i.mmv} className="bg-primary" />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---- Compass ----------------------------------------------------------------
export function Compass() {
  const { room } = useGame();
  const exits = room?.exits ?? {};
  const name = (d: string) => (d in exits ? game.mapper.rooms.get(exits[d])?.name ?? 'unexplored' : '');
  const node = (d: string, pos: string, labelFirst = false) => {
    const open = d in exits;
    const label = <span className={`font-mono text-[9px] uppercase tracking-wider text-primary truncate ${d === 'n' || d === 's' ? 'max-w-[110px]' : 'max-w-[64px]'}`}>{name(d)}</span>;
    return (
      <button
        disabled={!open}
        onClick={() => game.command(DIR_NAMES[d])}
        title={open ? `${DIR_NAMES[d]}: ${name(d)}` : `No exit ${DIR_NAMES[d]}`}
        className={`absolute z-20 flex flex-col items-center gap-1 group ${pos} disabled:opacity-35 disabled:cursor-not-allowed`}
      >
        {labelFirst && open && label}
        <span className={`w-9 h-9 rounded-full grid place-items-center shadow-lg font-mono text-xs font-bold transition-transform ${open ? 'bg-primary text-on-primary group-hover:bg-primary-fixed group-hover:scale-110' : 'bg-surface-highest text-outline'}`}>
          {d.toUpperCase()}
        </span>
        {!labelFirst && open && label}
      </button>
    );
  };
  return (
    <section className="card p-4 sm:p-5 flex flex-col items-center">
      <div className="w-full"><CardHead icon="explore" title="Directional Manifold" right={<span className="label-caps text-secondary">Compass</span>} /></div>
      <div className="relative w-64 h-64 my-2 grid place-items-center">
        <div className="absolute inset-0 rounded-full bg-surface-lowest shadow-2xl grid place-items-center border border-surface-high/40">
          <div className="w-[92%] h-[92%] rounded-full bg-surface-mid grid place-items-center shadow-inner">
            <div className="w-3/4 h-3/4 rounded-full bg-surface-lowest grid place-items-center border border-surface-high/30">
              <div className="w-1/2 h-1/2 rounded-full bg-surface-low flex flex-col items-center justify-center text-center p-2 shadow-inner">
                <span className="label-caps text-[9px] text-outline">Room</span>
                <span className="font-mono text-xs text-primary font-bold">{room ? `#${room.num}` : '—'}</span>
              </div>
            </div>
          </div>
        </div>
        {node('n', 'top-2 left-1/2 -translate-x-1/2')}
        {node('s', 'bottom-2 left-1/2 -translate-x-1/2', true)}
        {node('e', 'right-0 top-[calc(50%-18px)]')}
        {node('w', 'left-0 top-[calc(50%-18px)]')}
      </div>
      <div className="w-full grid grid-cols-2 gap-2 pt-2 border-t border-surface-high/30">
        {(['u', 'd'] as const).map((d) => (
          <button key={d} disabled={!(d in exits)} onClick={() => game.command(DIR_NAMES[d])}
            className="flex items-center justify-between p-2 rounded bg-surface-mid hover:bg-surface-high border border-surface-high/30 disabled:opacity-40 disabled:cursor-not-allowed">
            <span className="flex items-center gap-1.5 min-w-0">
              <Icon name={d === 'u' ? 'arrow_upward' : 'arrow_downward'} className="text-primary text-sm" />
              <span className="label-caps text-on-surface">{d === 'u' ? 'Up' : 'Down'}</span>
              <span className="font-mono text-[10px] text-outline truncate">{name(d)}</span>
            </span>
            <span className={`chip ${d in exits ? 'bg-primary/20 text-primary border-primary/30' : 'bg-surface-lowest text-outline border-surface-high/40'}`}>{d in exits ? 'Open' : 'None'}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ---- Satchel (invdata) ------------------------------------------------------
const TYPE_INFO: Record<number, [string, string, string?]> = {
  // type: [label, icon, primary verb]
  1: ['Light', 'flashlight_on', 'hold'], 2: ['Scroll', 'history_edu', 'recite'], 3: ['Wand', 'magic_button', 'hold'],
  4: ['Staff', 'magic_button', 'hold'], 5: ['Weapon', 'swords', 'wield'], 6: ['Treasure', 'diamond', 'wear'],
  7: ['Armor', 'shield', 'wear'], 8: ['Potion', 'science', 'quaff'], 9: ['Furniture', 'chair'], 10: ['Trash', 'delete'],
  11: ['Container', 'inventory_2'], 12: ['Drink', 'local_drink', 'drink'], 13: ['Key', 'key'], 14: ['Food', 'restaurant', 'eat'],
  15: ['Boat', 'sailing'], 16: ['Corpse', 'skull'], 17: ['Corpse', 'skull'], 18: ['Fountain', 'water_drop'], 19: ['Pill', 'medication', 'eat'],
  20: ['Portal', 'blur_circular', 'hold'], 21: ['Beacon', 'cell_tower'], 22: ['Gift card', 'redeem'], 24: ['Material', 'hexagon'],
  25: ['Campfire', 'local_fire_department'], 26: ['Forge', 'construction'], 27: ['Runestone', 'token'],
};
const FLAG_NAMES: Record<string, string> = { K: 'Kept', I: 'Invis', M: 'Magic', G: 'Glow', H: 'Hum', C: 'Cursed', E: 'Venom', T: 'Tempered', W: 'Weak' };

export function Satchel({ bare = false }: { bare?: boolean }) {
  const { inventory, inventoryAt, loggedIn } = useGame();
  const [open, setOpen] = useState<InvItem | null>(null);
  const carried = inventory.filter((i) => i.wearLoc === -1);
  return (
    <section className={`@container flex flex-col gap-3 ${bare ? '' : 'card p-4 sm:p-5'}`}>
      <CardHead icon="work" iconClass="text-outline" title="Satchel"
        right={<span className="font-mono text-[10px] text-on-surface-variant">{carried.length} ITEMS</span>} />
      {carried.length === 0 ? (
        <Empty>{loggedIn ? (inventoryAt ? 'You carry nothing.' : 'Reading your inventory…') : 'Log in to see your inventory.'}</Empty>
      ) : (
        <div className={`grid grid-cols-3 @sm:grid-cols-4 gap-2 ${bare ? '' : 'max-h-80 overflow-y-auto scroll-thin pr-1'}`}>
          {carried.map((it) => {
            const [label, icon] = TYPE_INFO[it.type] ?? ['Item', 'category'];
            return (
              <button key={it.id} onClick={() => setOpen(it)} title={it.plainName}
                className="aspect-square bg-surface-lowest/50 rounded p-1.5 flex flex-col items-center justify-center text-center shadow-inner hover:bg-surface-lowest/80 border border-surface-high/30 group">
                <Icon name={icon} className="text-primary text-xl group-hover:scale-110 transition-transform" />
                <span className="text-[10px] text-on-surface-variant mt-1 leading-tight line-clamp-2"><SegText segs={it.name} /></span>
                <span className="font-mono text-[8px] text-outline uppercase mt-0.5">{label} · L{it.level}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="p-2.5 rounded bg-surface-lowest/80 border border-surface-high/30 flex items-center justify-between text-xs font-mono text-outline">
        <span>{inventory.length - carried.length} worn</span>
        <button className="label-caps text-primary hover:underline" onClick={() => game.refreshInventory()} disabled={!loggedIn}>Refresh</button>
      </div>
      {open && <ItemModal item={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function ItemModal({ item, onClose }: { item: InvItem; onClose: () => void }) {
  const [label, icon, verb] = TYPE_INFO[item.type] ?? ['Item', 'category'];
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const act = (cmd: string) => { game.command(cmd); onClose(); };
  return (
    <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface-low max-w-lg w-full rounded-xl p-5 shadow-2xl flex flex-col gap-4 border border-surface-high/40" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="flex items-start justify-between pb-2.5 border-b border-surface-high/30">
          <div className="flex items-center gap-2">
            <Icon name={icon} className="text-primary text-xl" />
            <div className="flex flex-col">
              <h3 className="font-display text-base text-primary"><SegText segs={item.name} /></h3>
              <span className="font-mono text-[10px] text-outline">Object #{item.id}</span>
            </div>
          </div>
          <button className="p-1 rounded text-outline hover:text-on-surface hover:bg-surface-mid" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[['Type', label], ['Level', String(item.level)], ['Timer', item.timer < 0 ? 'None' : `${item.timer}s`]].map(([k, v]) => (
            <div key={k} className="flex flex-col bg-surface-mid p-2 rounded">
              <span className="label-caps text-[9px] text-outline">{k}</span>
              <span className="font-mono text-xs text-secondary font-bold">{v}</span>
            </div>
          ))}
        </div>
        {(item.flags || item.unique) && (
          <div className="flex gap-1.5 flex-wrap">
            {item.unique && <span className="chip bg-tertiary/15 text-tertiary border-tertiary/30">Unique</span>}
            {[...item.flags].map((f) => <span key={f} className={`chip ${f === 'C' ? 'bg-error-container text-error border-error/40' : 'bg-primary/15 text-primary border-primary/30'}`}>{FLAG_NAMES[f] ?? f}</span>)}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <button className="btn" onClick={() => act(`look ${item.id}`)}>Look</button>
          <button className="btn btn-danger" onClick={() => act(`drop ${item.id}`)}>Drop</button>
          <button className="btn" onClick={() => { fillCommand(` ${item.id}`); onClose(); }}>Use in command…</button>
          {verb && <button className="btn btn-primary" onClick={() => act(`${verb} ${item.id}`)}>{verb}</button>}
        </div>
      </div>
    </div>
  );
}
