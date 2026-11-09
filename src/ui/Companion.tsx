import { useState } from 'react';
import { actionRoll, armedFor, damage, pay, toggleArm, usePlay, withGain } from '../app/play';
import { updateCharacter } from '../app/store';
import { toast } from '../app/toast';
import { classById } from '../data';
import { companionStats, derive, newCompanion, type Character, type Companion } from '../rules';
import { cap, Rich, Track } from './kit';

/** The Beastbound companion sheet: command it, add its Experiences, mark its Stress, pick its level-up options. */
export function CompanionPanel({ ch }: { ch: Character }) {
  const c = ch.companion ?? newCompanion();
  const st = companionStats(ch);
  const d = derive(ch);
  const set = (fn: (x: Companion) => Companion) => updateCharacter(ch.id, (x) => ({ ...x, companion: fn(x.companion ?? newCompanion()) }));
  const armed = usePlay((s) => s.armed[ch.id]) ?? armedFor(ch.id);
  const options = classById.get('ranger')!.extras.companion!.levelUpOptions;
  const name = c.name || 'Companion';
  const spell = d.spellcastTraits.slice().sort((a, b) => d.traits[b] - d.traits[a])[0];
  const comfortKey = 'rest:companion:creature-comfort';
  const out = c.stress >= st.stressSlots;
  const [open, setOpen] = useState(false);
  return (
    <div className="feat stack-10" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="s-row">
        <input className="s-field" style={{ flex: 1, minHeight: 40 }} aria-label="Companion name" placeholder="Companion name" value={c.name}
          onChange={(e) => set((x) => ({ ...x, name: e.target.value }))} />
        <span className="s-label" style={{ fontSize: 14, marginLeft: 10 }}>Evasion <span className="s-num" style={{ fontSize: 20 }}>{st.evasion}</span></span>
      </div>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="s-label" style={{ fontSize: 13 }}>Stress</span>
        <Track label={`${name} Stress`} value={c.stress} max={st.stressSlots} total={st.stressSlots} size={24} onChange={(v) => set((x) => ({ ...x, stress: v }))} />
        {out && <span className="s-muted" style={{ fontSize: 13 }}>Out of the scene until your next long rest.</span>}
      </span>
      <span className="ctl-row">
        <button className="s-mini solid" disabled={!spell || out}
          onClick={() => actionRoll(ch.id, `Command ${name}`, [{ label: `Spellcast · ${cap(spell)}`, value: d.traits[spell] }, ...(d.spellcastBonus ? [{ label: 'Spellcast bonus', value: d.spellcastBonus }] : [])], 'Spellcast Roll',
            { trait: spell, attack: true, damageFn: (o) => damage(`${name} · damage`, { dice: [{ count: d.proficiency, sides: st.damageDie }], bonus: 0, critical: !!o.critical }, `${d.proficiency}d${st.damageDie} ${c.damageType}`, [], { charId: ch.id, magic: c.damageType === 'magic', attack: true }) })}>
          Command · Spellcast
        </button>
        <button className="s-mini" disabled={out} onClick={() => damage(`${name} · damage`, { dice: [{ count: d.proficiency, sides: st.damageDie }], bonus: 0 }, `${d.proficiency}d${st.damageDie} ${c.damageType}`, [], { charId: ch.id, magic: c.damageType === 'magic', attack: true })}>
          Damage {d.proficiency}d{st.damageDie}
        </button>
        <button className="s-mini" aria-label="Damage type" onClick={() => set((x) => ({ ...x, damageType: x.damageType === 'physical' ? 'magic' : 'physical' }))}>{c.damageType}</button>
      </span>
      <span className="s-label" style={{ fontSize: 12 }}>Companion Experiences · 1 Hope to add one</span>
      {st.experiences.map((e, i) => {
        const key = `companion-exp:${i}`;
        const on = armed.arms.some((x) => x.key === key);
        return (
          <span key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="s-field" style={{ flex: 1, minHeight: 40 }} aria-label={`Companion Experience ${i + 1}`} placeholder="Experience" value={e.name}
              onChange={(ev) => set((x) => { const ex = [...st.experiences.map((y) => y.name)]; ex[i] = ev.target.value; return { ...x, experiences: ex }; })} />
            <button className={`s-mini ${on ? 'solid' : ''}`} aria-pressed={on} disabled={!on && ch.hope < 1}
              onClick={() => toggleArm(ch.id, { key, label: `${e.name || 'Companion Experience'} +${e.value} · 1 Hope`, effect: { roll: e.value }, cost: { hope: 1 } })}>+{e.value}</button>
          </span>
        );
      })}
      {c.options.includes('creature-comfort') && (
        <span className="ctl-row">
          <button className="s-mini" disabled={(ch.uses[comfortKey] ?? 0) >= 1} onClick={() => { updateCharacter(ch.id, (x) => ({ ...withGain(x, { hope: 1 }), uses: { ...x.uses, [comfortKey]: 1 } })); toast('Creature Comfort: +1 Hope.'); }}>Creature Comfort · +1 Hope</button>
          <button className="s-mini" disabled={(ch.uses[comfortKey] ?? 0) >= 1} onClick={() => { if (!pay(ch.id)) return; updateCharacter(ch.id, (x) => ({ ...withGain(x, { stress: 1 }), uses: { ...x.uses, [comfortKey]: 1 }, companion: { ...(x.companion ?? newCompanion()), stress: Math.max(0, (x.companion?.stress ?? 0) - 1) } })); toast('Creature Comfort: you both clear a Stress.'); }}>Both clear a Stress</button>
        </span>
      )}
      <button className="s-mini" style={{ alignSelf: 'flex-start' }} aria-expanded={open} onClick={() => setOpen(!open)}>
        Level-up options · {c.options.length}/{st.optionsAllowed}{c.options.length ? `: ${options.filter((o) => c.options.includes(o.id)).map((o) => o.name).join(', ')}` : ''}
      </button>
      {open && options.map((o) => {
        const has = c.options.includes(o.id);
        return (
          <div key={o.id} className="s-row" style={{ alignItems: 'flex-start', gap: 10 }}>
            <span style={{ flex: 1, fontSize: 14, lineHeight: 1.4 }}><b>{o.name}.</b> <Rich text={o.text} /></span>
            <button className={`s-mini ${has ? 'solid' : ''}`} aria-pressed={has} disabled={!has && c.options.length >= st.optionsAllowed}
              onClick={() => set((x) => ({ ...x, options: has ? x.options.filter((y) => y !== o.id) : [...x.options, o.id] }))}>{has ? 'Taken' : 'Take'}</button>
          </div>
        );
      })}
    </div>
  );
}
