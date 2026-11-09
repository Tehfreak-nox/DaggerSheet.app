import { useState } from 'react';
import { go } from '../app/nav';
import { usePlay, useItem } from '../app/play';
import { beastAttack, beastDamage, weaponAttack, weaponDamage } from '../app/attack';
import { updateCharacter } from '../app/store';
import { armorById, lootById, rules, weaponById } from '../data';
import {
  ACTIVE, ITEM_USE, activeCtx, setActive,
  activeForm, addGold, attackProfile, DENOMS, derive, equipWeapon, removeGold, ROW_SLOTS, store, take, versatileStats,
  type AttackProfile, type Character, type Denom,
} from '../rules';
import { AdvDis, ArmorShield } from './CharacterTab';
import { EquipmentControls, FeatureCard } from '../ui/FeatureCard';
import { cap, Icon, ICONS, RANGE_NAMES, signed, Title } from '../ui/kit';

export function EquipmentTab({ ch }: { ch: Character }) {
  const d = derive(ch);
  return (
    <main className="sheet-main">
      <section className="prof-bar">
        <div className="prof" role="img" aria-label={`Proficiency ${d.proficiency} of ${rules.caps.proficiency}`}>
          <span className="s-label">Proficiency</span>
          <span style={{ display: 'flex', gap: 6 }}>
            {Array.from({ length: rules.caps.proficiency }, (_, i) => <span key={i} className={`s-dot ${i < d.proficiency ? 'on' : ''}`} />)}
          </span>
        </div>
        <AdvDis id={ch.id} compact />
      </section>
      <BeastAttack ch={ch} />
      <Weapons ch={ch} />
      <ArmorSection ch={ch} />
      <GoldSection ch={ch} />
      <Items ch={ch} />
      <span className="s-muted" style={{ fontSize: 13, textAlign: 'center' }}>Tier {d.tier} · you can equip gear of tier {d.tier} or lower.</span>
    </main>
  );
}

function Hands({ burden, slot }: { burden: number; slot: 'primary' | 'secondary' }) {
  const left = burden === 2 || slot === 'primary';
  const right = burden === 2 || slot === 'secondary';
  return (
    <span style={{ display: 'flex' }} role="img" aria-label={burden === 2 ? 'Two-handed' : slot === 'primary' ? 'Main hand' : 'Off hand'}>
      <Icon d={ICONS.hand} size={22} stroke={1.5} style={{ transform: 'scaleX(-1)', opacity: left ? 1 : 0.2 }} />
      <Icon d={ICONS.hand} size={22} stroke={1.5} style={{ opacity: right ? 1 : 0.2 }} />
    </span>
  );
}

function Weapons({ ch }: { ch: Character }) {
  const crit = usePlay((s) => !!s.crit[ch.id]);
  const slots: ('primary' | 'secondary')[] = ['primary', 'secondary'];

  const row = (slot: 'primary' | 'secondary', a: AttackProfile) => {
    const ws = ch[slot];
    const w = ws ? weaponById.get(ws.id) : undefined;
    const vs = w ? versatileStats(w.feature) : null;
    // Secondary-weapon damage bonuses (Paired, Focused) apply while the weapon is equipped.
    const conds = a.conditional;
    const dmgDice = a.dice.map((x) => `${x.count}d${x.sides}`).join('+');
    const bonus = a.damageBonus + conds.reduce((s, m) => s + m.value, 0);
    const dmgText = `${dmgDice}${bonus ? signed(bonus).replace('−', '-') : ''} ${a.damageType}`;
    const hit = [{ label: cap(a.trait), value: a.traitValue }, ...a.attackModifiers];
    const hitTotal = hit.reduce((s, m) => s + m.value, 0);
    const rollDamage = (critical: boolean) => weaponDamage(ch.id, slot, { critical });
    return (
      <article key={slot} className="weapon">
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="s-label s-muted" style={{ fontSize: 12 }}>{slot === 'primary' ? 'Primary' : 'Secondary'}</span>
          <span className="s-feat-name" style={{ fontSize: 22, marginTop: -4 }}>{a.name}</span>
          <div className="s-row" style={{ fontSize: 17 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Hands burden={w?.burden ?? 1} slot={slot} />
              {cap(a.trait)} {RANGE_NAMES[a.range] ?? a.range}
            </span>
          </div>
          {a.feature && <span className="s-feat-text"><b>{a.feature.name}:</b> {a.feature.text}</span>}
          {a.feature && w && <EquipmentControls ch={ch} item={w.id} feature={a.feature} />}
          {!w && <span className="s-feat-text">I Am the Weapon: a trait of your choice, Melee, d8+d6 using your Proficiency. +1 Evasion while you have no other active weapons.</span>}
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {vs && (
              <button className={`s-mini ${ws?.versatile ? 'solid' : ''}`} aria-pressed={!!ws?.versatile}
                onClick={() => updateCharacter(ch.id, (c) => ({ ...c, [slot]: { ...c[slot]!, versatile: !c[slot]!.versatile } }))}>
                Versatile · {cap(vs.trait)} {RANGE_NAMES[vs.range]}
              </button>
            )}
            {w && (
              <button className="s-mini" onClick={() => updateCharacter(ch.id, (c) => ({ ...c, [slot]: undefined, inventoryWeapons: [...c.inventoryWeapons, c[slot]!].slice(0, 2) }))}>
                Unequip
              </button>
            )}
          </span>
        </div>
        <div className="weapon-btns">
          <button className="s-btn solid s-press" onClick={() => weaponAttack(ch.id, slot)} aria-label={`Hit roll 2d12 ${signed(hitTotal)}`}>
            <span style={{ fontSize: 11, opacity: 0.75 }}>Hit</span><span className="s-num">{signed(hitTotal)}</span>
          </button>
          <button className={`s-btn s-press ${crit ? 's-armed' : ''}`} style={{ borderColor: 'var(--ink)', background: 'var(--surface)' }}
            onClick={() => rollDamage(crit)}
            aria-label={`Damage roll ${dmgText}${crit ? ', critical' : ''}`}>
            <span style={{ fontSize: 11 }}>{crit ? 'Crit dmg' : 'Damage'}</span><span className="s-num" style={{ fontSize: dmgText.length > 12 ? 15 : 19 }}>{dmgDice}{bonus ? signed(bonus).replace('−', '-') : ''}</span>
          </button>
        </div>
      </article>
    );
  };

  return (
    <section className="stack-22">
      <Title>Weapons</Title>
      {ch.beastform && <span className="callout">While transformed you can’t use weapons or cast spells from domain cards.</span>}
      {slots.map((slot) => {
        const a = attackProfile(ch, slot);
        return a ? row(slot, a) : null;
      })}
      {ch.inventoryWeapons.length > 0 && (
        <div className="stack-6">
          <span className="s-label s-muted" style={{ fontSize: 12 }}>Inventory weapons · swap free at rest, else mark a Stress</span>
          {ch.inventoryWeapons.map((ws, i) => {
            const w = weaponById.get(ws.id);
            if (!w) return null;
            return (
              <div key={i} className="s-row inv-weapon">
                <span><b>{w.name}</b> <span className="s-muted">· {cap(w.trait)} {RANGE_NAMES[w.range]} · d{w.damage.die}{w.damage.bonus ? '+' + w.damage.bonus : ''}</span></span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button className="s-mini" onClick={() => updateCharacter(ch.id, (c) => {
                    const slot = w.category;
                    const cur = c[slot];
                    const inv = c.inventoryWeapons.filter((_, j) => j !== i);
                    const next = equipWeapon({ ...c, inventoryWeapons: cur ? [...inv, cur] : inv }, slot, ws);
                    return next;
                  })}>Equip</button>
                  <button className="s-mini" aria-label={`Drop ${w.name}`} onClick={() => updateCharacter(ch.id, (c) => ({ ...c, inventoryWeapons: c.inventoryWeapons.filter((_, j) => j !== i) }))}>Drop</button>
                </span>
              </div>
            );
          })}
        </div>
      )}
      <button className="s-btn s-press" style={{ alignSelf: 'flex-end' }} onClick={() => go({ name: 'picker', id: ch.id, kind: 'weapon' })}>Add weapon</button>
    </section>
  );
}

/** The Beastform's attack and features, while transformed. Their arms (Pack Hunting, Rampage) apply to this attack. */
function BeastAttack({ ch }: { ch: Character }) {
  const d = derive(ch);
  const f = activeForm(ch);
  const crit = usePlay((s) => !!s.crit[ch.id]);
  if (!f) return null;
  const at = f.attack;
  const traitVal = at ? d.traits[at.trait] : 0;
  const bonus = at ? at.bonus + d.modifiers.filter((m) => m.stat === 'damage' && !m.condition).reduce((s2, m) => s2 + m.value, 0) : 0;
  const dieText = at ? `${d.proficiency}d${at.sides}${bonus ? `+${bonus}` : ''}` : '';
  return (
    <section className="stack-14">
      <Title>Beastform</Title>
      <article className="weapon">
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="s-label s-muted" style={{ fontSize: 12 }}>Tier {f.form.tier} · {f.form.examples}</span>
          <span className="s-feat-name" style={{ fontSize: 22, marginTop: -4 }}>{f.name}</span>
          {at && <span style={{ fontSize: 17 }}>{cap(at.trait)} {RANGE_NAMES[at.range] ?? at.range} · d{at.sides}{at.bonus ? `+${at.bonus}` : ''} {at.type} using your Proficiency</span>}
          {f.advantages.length > 0 && <span className="s-feat-text">Advantage on rolls to {f.advantages.join(', ')}.</span>}
        </div>
        {at && (
          <div className="weapon-btns">
            <button className="s-btn solid s-press" aria-label={`Hit roll 2d12 ${signed(traitVal)}`} onClick={() => beastAttack(ch.id)}>
              <span style={{ fontSize: 11, opacity: 0.75 }}>Hit</span><span className="s-num">{signed(traitVal)}</span>
            </button>
            <button className={`s-btn s-press ${crit ? 's-armed' : ''}`} style={{ borderColor: 'var(--btn-b)', background: 'var(--surface)' }} onClick={() => beastDamage(ch.id, { critical: crit })}
              aria-label={`Damage roll ${dieText} ${at.type}${crit ? ', critical' : ''}`}>
              <span style={{ fontSize: 11 }}>{crit ? 'Crit dmg' : 'Damage'}</span><span className="s-num" style={{ fontSize: dieText.length > 9 ? 14 : 17 }}>{dieText}</span>
            </button>
          </div>
        )}
      </article>
      {f.features.map((x) => <FeatureCard key={x.key} ch={ch} featureKey={`beast:${x.key}`} name={x.feature.name} meta={x.from !== f.name ? x.from : undefined} text={x.feature.text} />)}
      {f.form.text && <span className="s-feat-text">{f.form.text}</span>}
    </section>
  );
}

function ArmorSection({ ch }: { ch: Character }) {
  const d = derive(ch);
  const a = ch.armorId ? armorById.get(ch.armorId) : undefined;
  return (
    <section className="stack-18">
      <Title>Armor</Title>
      <article style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="s-feat-name" style={{ fontSize: 22 }}>{a?.name ?? 'Unarmored'}</span>
          <span className="s-chip" style={{ alignSelf: 'flex-start' }}>Major threshold {d.thresholds.major}</span>
          <span className="s-chip" style={{ alignSelf: 'flex-start' }}>Severe threshold {d.thresholds.severe}</span>
          {a?.feature && <span className="s-feat-text" style={{ fontSize: 15 }}><b>{a.feature.name}:</b> {a.feature.text}</span>}
          {a?.feature && <EquipmentControls ch={ch} item={a.id} feature={a.feature} />}
          <span className="s-muted" style={{ fontSize: 13 }}>
            {a ? `Base ${a.thresholds.major} / ${a.thresholds.severe} · score ${a.score} · +${ch.level} level` : `Major = level, Severe = 2 × level`}
            {d.modifiers.filter((m) => ['major', 'severe', 'armorScore'].includes(m.stat) && m.source !== a?.name).map((m) => ` · ${m.source} ${signed(m.value)} ${m.stat === 'armorScore' ? 'armor' : m.stat}`).filter((x, i, arr) => arr.indexOf(x) === i).join('')}
          </span>
        </div>
        <ArmorShield score={d.armorScore} small />
      </article>
      <span style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
        {a && <button className="s-btn s-press" onClick={() => updateCharacter(ch.id, (c) => ({ ...c, armorId: undefined, armorMarked: 0 }))}>Remove</button>}
        <button className="s-btn s-press" onClick={() => go({ name: 'picker', id: ch.id, kind: 'armor' })}>Change armor</button>
      </span>
    </section>
  );
}

const GOLD_LABEL: Record<Denom, string> = { coins: 'Coins', handfuls: 'Handfuls', bags: 'Bags', chests: 'Chest' };

function GoldSection({ ch }: { ch: Character }) {
  const [safeOpen, setSafeOpen] = useState(false);
  const [note, setNote] = useState('');
  const g = ch.gold;
  const setGold = (gold: typeof g) => updateCharacter(ch.id, (c) => ({ ...c, gold }));

  const tap = (denom: Denom, i: number) => {
    const have = g[denom];
    if (i < have) {
      setGold({ ...g, [denom]: i });
      setNote('');
      return;
    }
    const r = addGold(g, denom, i + 1 - have);
    setGold(r.gold);
    setNote(r.overflow ? 'You can carry at most 1 chest. Spend some gold or put it in the safe.' : '');
  };
  const safeTotal = DENOMS.filter((x) => ch.safe[x]).map((x) => `${ch.safe[x]} ${GOLD_LABEL[x].toLowerCase()}`).join(', ') || 'empty';

  return (
    <section className="stack-14">
      <Title>Gold</Title>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -6 }}>
        <button className={`s-btn s-press ${safeOpen ? 's-armed' : ''}`} style={{ minHeight: 44, padding: '0 12px', fontSize: 13 }} aria-expanded={safeOpen} onClick={() => setSafeOpen(!safeOpen)}>
          <Icon d={ICONS.safe} size={16} /> Safe · {safeTotal}
        </button>
      </div>
      {safeOpen && (
        <div className="stack-6 safe">
          <span className="s-muted" style={{ fontSize: 14 }}>Stored at your base, no limit.</span>
          <button className={`s-mini ${ch.coins ? 'solid' : ''}`} style={{ alignSelf: 'flex-start' }} aria-pressed={!!ch.coins}
            onClick={() => updateCharacter(ch.id, (c) => ({ ...c, coins: !c.coins }))}>
            {ch.coins ? 'Coins on · tap to hide' : 'Track coins (optional rule)'}
          </button>
          {DENOMS.filter((x) => ch.coins || x !== 'coins').map((x) => (
            <div key={x} className="s-row" style={{ minHeight: 48 }}>
              <span className="s-label" style={{ flex: 1 }}>{GOLD_LABEL[x]}</span>
              <button className="s-mini" disabled={!ch.safe[x]} aria-label={`Take one ${x} from the safe`}
                onClick={() => { const r = take(ch.gold, ch.safe, x); if (r) updateCharacter(ch.id, (c) => ({ ...c, gold: r.carried, safe: r.safe })); }}>Take</button>
              <span className="s-num" style={{ width: 34, textAlign: 'center', fontSize: 20 }}>{ch.safe[x]}</span>
              <button className="s-mini" disabled={!ch.gold[x] && !removeGold(ch.gold, x)} aria-label={`Store one ${x} in the safe`}
                onClick={() => { const r = store(ch.gold, ch.safe, x); if (r) updateCharacter(ch.id, (c) => ({ ...c, gold: r.carried, safe: r.safe })); }}>Store</button>
            </div>
          ))}
        </div>
      )}
      {DENOMS.filter((x) => ch.coins || x !== 'coins').map((x) => (
        <div key={x} className="stack-2">
          <div className="s-row"><span className="s-label">{GOLD_LABEL[x]}</span><span className="s-num s-muted" style={{ fontSize: 15 }}>{g[x]}</span></div>
          <div style={{ display: 'flex', margin: '0 -3px', flexWrap: 'wrap' }} role="group" aria-label={GOLD_LABEL[x]}>
            {Array.from({ length: ROW_SLOTS[x] }, (_, i) => (
              <button key={i} className="s-slotbtn" style={{ width: 33, height: 40 }} aria-label={`${GOLD_LABEL[x]} ${i + 1}, ${i < g[x] ? 'marked' : 'empty'}`} onClick={() => tap(x, i)}>
                <span className={`s-sq ${i < g[x] ? 'on' : ''}`} style={{ width: 27, height: 27 }} />
              </button>
            ))}
          </div>
        </div>
      ))}
      <span className="s-muted" style={{ fontSize: 13, textAlign: 'center' }} role="status">{note || `${ch.coins ? '10 coins = 1 handful · ' : ''}10 handfuls = 1 bag · 10 bags = 1 chest`}</span>
    </section>
  );
}

function Items({ ch }: { ch: Character }) {
  const [drag, setDrag] = useState<number | null>(null);
  const move = (from: number, to: number) => updateCharacter(ch.id, (c) => {
    const items = [...c.items];
    const [it] = items.splice(from, 1);
    items.splice(to, 0, it);
    return { ...c, items };
  });
  // Lasting effects from items (potions, salves): shown here until they end.
  const itemEffects = (ch.active ?? []).filter((k) => k.startsWith('item:') && ACTIVE[k]);

  return (
    <section className="stack-4">
      <Title style={{ marginBottom: 10 }}>Items</Title>
      {ch.items.length === 0 && <span className="s-muted">No items. Add loot or consumables below.</span>}
      {itemEffects.map((k) => {
        const def = ACTIVE[k];
        const note = typeof def.note === 'function' ? def.note(activeCtx(ch, k, derive(ch).traits)) : def.note;
        return (
          <div key={k} className="beast-on">
            <span style={{ flex: 1, fontSize: 14 }}><b>{lootById.get(k.slice(5))?.name ?? 'Item'}.</b> {note}</span>
            <button className="s-mini" onClick={() => updateCharacter(ch.id, (c) => setActive(c, k, false))}>End</button>
          </div>
        );
      })}
      {ch.items.map((it, i) => {
        const loot = lootById.get(it.id);
        const name = loot?.name ?? it.name ?? it.id;
        const consumable = loot?.kind === 'consumable';
        const plan = loot ? ITEM_USE[loot.id] : undefined;
        const choices = plan && 'choose' in plan ? plan.choose : null;
        return (
          <div key={`${it.id}-${i}`} className={`item-row ${drag === i ? 'dragging' : ''}`}
            onPointerEnter={() => { if (drag !== null && drag !== i) { move(drag, i); setDrag(i); } }}>
            <button className="grip" aria-label={`Reorder ${name}`}
              onPointerDown={(e) => { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); setDrag(i); }}
              onPointerUp={() => setDrag(null)}
              onKeyDown={(e) => { if (e.key === 'ArrowUp' && i > 0) move(i, i - 1); if (e.key === 'ArrowDown' && i < ch.items.length - 1) move(i, i + 1); }}>
              <Icon d={ICONS.grip} size={18} stroke={2.2} />
            </button>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="s-feat-name" style={{ fontSize: 19 }}>{name}</span>
              {loot && <span className="s-muted" style={{ fontSize: 15 }}>{loot.text}</span>}
              {loot && !consumable && <EquipmentControls ch={ch} item={`item-${loot.id}`} feature={{ name, text: loot.text }} />}
              {consumable && choices && (
                <span className="ctl-row">
                  {choices.map((c) => <button key={c.label} className="s-mini solid" onClick={() => useItem(ch.id, i, c.use)}>{c.label}</button>)}
                </span>
              )}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
              {it.qty > 1 && <span className="s-num s-muted" style={{ fontSize: 16 }}>×{it.qty}</span>}
              {consumable && !choices ? (
                <button className="s-btn solid s-press" style={{ minHeight: 44, padding: '0 14px' }} onClick={() => useItem(ch.id, i)}>Use</button>
              ) : (
                <button className="s-mini" aria-label={`Remove ${name}`} onClick={() => updateCharacter(ch.id, (c) => ({ ...c, items: c.items.filter((_, j) => j !== i) }))}>
                  <Icon d={ICONS.close} size={16} />
                </button>
              )}
            </span>
          </div>
        );
      })}
      {drag !== null && <div className="drag-catch" onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)} />}
      <button className="s-btn s-press" style={{ alignSelf: 'flex-end', marginTop: 10 }} onClick={() => go({ name: 'picker', id: ch.id, kind: 'item' })}>Add item</button>
    </section>
  );
}
