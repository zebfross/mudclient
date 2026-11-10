import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { game, useGame, type InvItem } from '../lib/store.ts';
import { CATEGORIES, categoryOf, type Category } from '../lib/inventory.ts';
import { stripAard } from '../lib/aardColor.ts';
import { compareItem, type Comparison, type ItemDetails } from '../lib/items.ts';
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

const CAT_KEY = 'gaslamp.satchelTab';

/** Compare carried items with what you wear, using cached `invdetails`. */
function useComparisons() {
  const { equipment, itemDetails, char } = useGame();
  const worn = useMemo(() => equipment.map((e) => itemDetails[e.id]).filter((d): d is ItemDetails => !!d), [equipment, itemDetails]);
  const level = Number(char.status?.level) || undefined;
  return (id: string) => {
    const d = itemDetails[id];
    return d ? compareItem(d, worn, level) : null;
  };
}

const VERDICT_STYLE: Record<Comparison['verdict'], string> = {
  better: 'bg-tertiary/20 text-tertiary border-tertiary/40',
  empty: 'bg-tertiary/20 text-tertiary border-tertiary/40',
  worse: 'bg-[#d4574a]/15 text-[#ff7b6b] border-[#d4574a]/40',
  same: 'bg-surface-high text-outline border-surface-highest',
  toohigh: 'bg-surface-high text-outline border-surface-highest',
};
function verdictText(c: Comparison, level: number) {
  if (c.verdict === 'toohigh') return `L${level}`;
  if (c.verdict === 'empty') return 'new';
  if (c.verdict === 'same') return '=';
  return `${c.delta > 0 ? '▲' : '▼'}${Math.abs(c.delta)}`;
}
function verdictTitle(c: Comparison, level: number) {
  if (c.verdict === 'toohigh') return `Needs level ${level}`;
  if (c.verdict === 'empty') return 'Fills an empty slot';
  return `${c.verdict === 'better' ? 'Better than' : c.verdict === 'worse' ? 'Worse than' : 'Same as'} what you wear (item score ${c.delta > 0 ? '+' : ''}${c.delta})`;
}

export function Satchel({ bare = false }: { bare?: boolean }) {
  const { inventory, inventoryAt, equipment, loggedIn, itemDetails, shop, room, shopAsking } = useGame();
  const compare = useComparisons();
  const here = shop && shop.room === room?.num ? shop : null;
  const [sellable, setSellable] = useState(false);
  const [open, setOpen] = useState<{ item: InvItem; worn: boolean } | null>(null);
  const [cat, setCat] = useState<Category>(() => { try { return (localStorage.getItem(CAT_KEY) as Category) || 'all'; } catch { return 'all'; } });
  const choose = (c: Category) => { setCat(c); try { localStorage.setItem(CAT_KEY, c); } catch { /* ignore */ } };

  const carried = inventory.filter((i) => i.wearLoc === -1);
  const count = (c: Category) => (c === 'all' ? carried.length : c === 'equipped' ? equipment.length : carried.filter((i) => categoryOf(i.type) === c).length);
  const tabs = CATEGORIES.filter((c) => c.id === 'all' || c.id === 'equipped' || count(c.id) > 0);
  const active = tabs.some((t) => t.id === cat) ? cat : 'all';
  const shown = active === 'equipped' ? equipment : active === 'all' ? carried : carried.filter((i) => categoryOf(i.type) === active);
  const items = here && sellable && active !== 'equipped' ? shown.filter((i) => typeof here.offers[i.id] === 'number') : shown;
  const buys = here ? carried.filter((i) => typeof here.offers[i.id] === 'number') : [];
  const asked = here ? carried.filter((i) => i.id in here.offers).length : 0;
  const total = buys.reduce((n, i) => n + (here!.offers[i.id] ?? 0), 0);
  const label = CATEGORIES.find((c) => c.id === active)!.label;

  return (
    <section className={`@container flex flex-col gap-3 ${bare ? '' : 'card p-4 sm:p-5'}`}>
      <CardHead icon="work" iconClass="text-outline" title="Satchel"
        right={<span className="font-mono text-[10px] text-on-surface-variant">{carried.length} carried · {equipment.length} worn</span>} />
      <div role="tablist" aria-label="Inventory categories" className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={active === t.id} aria-label={t.label} title={t.label} onClick={() => choose(t.id)}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors ${
              active === t.id ? 'bg-primary/20 text-primary border-primary/40' : 'text-outline border-surface-high/40 hover:text-on-surface'}`}>
            <Icon name={t.icon} className="text-base" />
            <span className="font-mono text-[10px] tabular-nums">{count(t.id)}</span>
          </button>
        ))}
      </div>
      {here && (
        <div className="rounded border border-secondary/40 bg-secondary/10 px-2.5 py-1.5 flex items-center gap-2 flex-wrap text-xs text-secondary">
          <Icon name="storefront" className="text-base" />
          <span className="flex-1 min-w-[10rem]">
            {shopAsking
              ? `Asking ${here.keeper || 'the shopkeeper'}… (${asked}/${carried.length})`
              : asked === 0
                ? 'You’re in a shop.'
                : buys.length
                  ? `${here.keeper || 'The shopkeeper'} would buy ${buys.length} of your items, about ${total.toLocaleString()} gold in all.`
                  : `${here.keeper || 'The shopkeeper'} isn’t interested in anything you've asked about.`}
          </span>
          {!shopAsking && asked < carried.length && (
            <button type="button" className="btn" onClick={() => game.checkShop()} disabled={!loggedIn}
              title="Asks the shopkeeper about each item ('value'); nothing is sold">
              {asked === 0 ? `What would they buy? (${carried.length} items)` : `Ask about ${carried.length - asked} more`}
            </button>
          )}
          {buys.length > 0 && (
            <label className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap">
              <input type="checkbox" checked={sellable} onChange={(e) => setSellable(e.target.checked)} className="accent-[#ffb77d]" /> Only these
            </label>
          )}
        </div>
      )}
      {items.length === 0 ? (
        <Empty>{!loggedIn ? 'Log in to see your inventory.' : !inventoryAt ? 'Reading your inventory…' : active === 'equipped' ? 'You aren’t wearing anything.' : active === 'all' ? 'You carry nothing.' : `No ${label.toLowerCase()}.`}</Empty>
      ) : (
        <div className={`grid grid-cols-3 @sm:grid-cols-4 gap-2 ${bare ? '' : 'max-h-80 overflow-y-auto scroll-thin pr-1'}`}>
          {items.map((it) => {
            const [typeLabel, icon] = TYPE_INFO[it.type] ?? ['Item', 'category'];
            const worn = active === 'equipped';
            const cmp = worn ? null : compare(it.id);
            const score = itemDetails[it.id]?.score;
            const offer = here && !worn ? here.offers[it.id] : undefined;
            const offerTitle = offer === undefined ? '' : offer === null ? ` — ${here!.keeper || 'the shopkeeper'} won’t buy this` : ` — sells here for about ${offer} gold`;
            return (
              <button key={it.id} onClick={() => setOpen({ item: it, worn })} title={`${it.plainName}${cmp ? ` — ${verdictTitle(cmp, it.level)}` : ''}${offerTitle}`}
                className={`${offer === null ? 'opacity-45 ' : ''}relative aspect-square bg-surface-lowest/50 rounded p-1.5 flex flex-col items-center justify-center text-center shadow-inner hover:bg-surface-lowest/80 border border-surface-high/30 group`}>
                <Icon name={icon} className="text-primary text-xl group-hover:scale-110 transition-transform" />
                <span className="text-[10px] text-on-surface-variant mt-1 leading-tight line-clamp-2"><SegText segs={it.name} /></span>
                <span className="font-mono text-[8px] text-outline uppercase mt-0.5">{typeLabel} · L{it.level}{worn && score !== undefined ? ` · ★${score}` : ''}</span>
                {typeof offer === 'number' && (
                  <span className="absolute top-1 left-1 rounded border border-secondary/50 bg-secondary/15 text-secondary px-1 font-mono text-[9px] font-bold leading-tight">{offer}g</span>
                )}
                {cmp && (
                  <span className={`absolute top-1 right-1 rounded border px-1 font-mono text-[9px] font-bold leading-tight ${VERDICT_STYLE[cmp.verdict]}`}>
                    {verdictText(cmp, it.level)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <div className="p-2.5 rounded bg-surface-lowest/80 border border-surface-high/30 flex items-center justify-between text-xs font-mono text-outline">
        <span>{label}</span>
        <button className="label-caps text-primary hover:underline" onClick={() => game.refreshInventory()} disabled={!loggedIn}>Refresh</button>
      </div>
      {open && <ItemModal item={open.item} worn={open.worn} onClose={() => setOpen(null)} />}
    </section>
  );
}

function ItemModal({ item, worn = false, onClose }: { item: InvItem; worn?: boolean; onClose: () => void }) {
  const [label, icon, verb] = TYPE_INFO[item.type] ?? ['Item', 'category'];
  const { itemDetails, equipment, shop, room } = useGame();
  const inShop = !worn && !!shop && shop.room === room?.num;
  const offer = inShop ? shop!.offers[item.id] : undefined;
  useEffect(() => { if (inShop && !(item.id in shop!.offers)) game.checkShop([item.id]); }, [item.id, inShop]);
  const details = itemDetails[item.id];
  const cmp = useComparisons()(item.id);
  const against = cmp?.against && equipment.find((e) => e.id === cmp.against!.id);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const act = (cmd: string) => { game.command(cmd); onClose(); };
  // Portal: the sidebar's blur/sticky styles would otherwise trap the overlay inside it.
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
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
        {details && (
          <div className="flex flex-col gap-2 rounded-lg bg-surface-mid/60 p-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs text-on-surface-variant">
                {details.wear ? <>Worn on <b className="text-on-surface">{details.wear}</b></> : 'Not wearable'}
                {details.weapon && <> · {details.weapon.kind}, {details.weapon.damage.toLowerCase()}, avg {details.weapon.avg}</>}
              </span>
              <span className="font-mono text-xs text-primary" title="Aardwolf's item score">★ {details.score}</span>
            </div>
            {Object.keys(details.stats).length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {Object.entries(details.stats).map(([k, v]) => (
                  <span key={k} className="chip bg-surface-high text-on-surface-variant border-surface-highest normal-case tracking-normal">{k} {v > 0 ? '+' : ''}{v}</span>
                ))}
              </div>
            )}
            {cmp && !worn && (
              <div className="border-t border-surface-high/40 pt-2 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className={`rounded border px-1.5 font-mono text-[10px] font-bold ${VERDICT_STYLE[cmp.verdict]}`}>{verdictText(cmp, details.level)}</span>
                  <span className="text-on-surface-variant">
                    {cmp.verdict === 'toohigh' ? `You can wear this at level ${details.level}.`
                      : cmp.verdict === 'empty' ? `Nothing worn on your ${details.wear} yet — wearing it is pure gain.`
                      : <>Compared with your <b className="text-on-surface">{against ? <SegText segs={against.name} /> : 'worn item'}</b> (★ {cmp.against?.score})</>}
                  </span>
                </div>
                {cmp.stats.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {cmp.stats.map(([k, v]) => (
                      <span key={k} className={`chip normal-case tracking-normal ${v > 0 ? 'bg-tertiary/15 text-tertiary border-tertiary/30' : 'bg-[#d4574a]/15 text-[#ff7b6b] border-[#d4574a]/40'}`}>
                        {k} {v > 0 ? '+' : ''}{v}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {(item.flags || item.unique) && (
          <div className="flex gap-1.5 flex-wrap">
            {item.unique && <span className="chip bg-tertiary/15 text-tertiary border-tertiary/30">Unique</span>}
            {[...item.flags].map((f) => <span key={f} className={`chip ${f === 'C' ? 'bg-error-container text-error border-error/40' : 'bg-primary/15 text-primary border-primary/30'}`}>{FLAG_NAMES[f] ?? f}</span>)}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <button className="btn" onClick={() => act(`look ${item.id}`)}>Look</button>
          {worn
            ? <button className="btn" onClick={() => act(`remove ${item.id}`)}>Remove</button>
            : <button className="btn btn-danger" onClick={() => act(`drop ${item.id}`)}>Drop</button>}
          {inShop && offer === null && <span className="text-[11px] text-outline self-center">{shop!.keeper || 'The shopkeeper'} won’t buy this</span>}
          {inShop && offer === undefined && <span className="text-[11px] text-outline self-center">Asking the shopkeeper…</span>}
          {typeof offer === 'number' && <button className="btn" onClick={() => act(`sell ${item.id}`)} title={`${shop?.keeper || 'The shopkeeper'} would pay about ${offer} gold`}><Icon name="sell" className="text-sm" /> Sell · {offer}g</button>}
          <button className="btn" onClick={() => { fillCommand(` ${item.id}`); onClose(); }}>Use in command…</button>
          {verb && !worn && <button className="btn btn-primary" onClick={() => act(`${verb} ${item.id}`)}>{verb}</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
