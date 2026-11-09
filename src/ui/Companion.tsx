import { useState } from 'react';
import { actionRoll, armedFor, damage, toggleArm, usePlay, withGain } from '../app/play';
import { updateCharacter } from '../app/store';
import { toast } from '../app/toast';
import { classById } from '../data';
import { COMPANION_DICE, COMPANION_RANGES, TRAINING_MAX, companionPicks, companionStats, derive, EXAMPLE_EXPERIENCES, newCompanion, type Character, type Companion, type CompanionPick } from '../rules';
import { cap, Icon, ICONS, Rich, signed, Track } from './kit';

/** The Beastbound companion: Create companion first, then its sheet at the top of the Subclass tab. */
export function CompanionPanel({ ch }: { ch: Character }) {
  const [editing, setEditing] = useState(false);
  if (!ch.companion || editing) {
    return <CompanionForm ch={ch} onDone={() => setEditing(false)} editing={!!ch.companion} />;
  }
  return <CompanionSheet ch={ch} onEdit={() => setEditing(true)} />;
}

function CompanionForm({ ch, onDone, editing }: { ch: Character; onDone: () => void; editing: boolean }) {
  const [open, setOpen] = useState(editing);
  const start = ch.companion ?? newCompanion();
  const st = companionStats(ch);
  const [f, setF] = useState<Companion>({ ...start, experiences: st.experiences.map((e) => e.name) });
  if (!open) {
    return (
      <button className="s-btn solid s-press" style={{ alignSelf: 'stretch' }} onClick={() => setOpen(true)}>Create companion</button>
    );
  }
  const field = (k: 'name' | 'species' | 'attack', label: string, placeholder: string) => (
    <label className="stack-4" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="s-label s-muted" style={{ fontSize: 12 }}>{label}</span>
      <input className="s-field" value={f[k] ?? ''} placeholder={placeholder} autoComplete="off" onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  const save = () => {
    updateCharacter(ch.id, (x) => ({ ...x, companion: { ...f, name: f.name.trim(), experiences: f.experiences.map((e) => e.trim()) } }));
    toast(editing ? 'Companion saved.' : `${f.name.trim()} joins you.`);
    setOpen(false);
    onDone();
  };
  return (
    <div className="feat" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span className="s-feat-name">{editing ? 'Edit companion' : 'Create companion'}</span>
      {field('name', 'Name', 'e.g. Ember, Old Gus, Whisper')}
      {field('species', 'What are they?', 'Bear, wolf, hawk, giant toad… whatever you and your GM imagine')}
      {field('attack', 'Standard attack', 'e.g. Bite, Talon Rake, Headbutt')}
      <span className="ctl-row" role="group" aria-label="Damage type">
        {(['physical', 'magic'] as const).map((t) => (
          <button key={t} className={`s-mini ${f.damageType === t ? 'solid' : ''}`} aria-pressed={f.damageType === t} onClick={() => setF({ ...f, damageType: t })}>{cap(t)} damage</button>
        ))}
      </span>
      <span className="s-label s-muted" style={{ fontSize: 12 }}>Companion Experiences (+2 each)</span>
      {f.experiences.map((e, i) => (
        <input key={i} className="s-field" value={e} autoComplete="off" aria-label={`Companion Experience ${i + 1}`}
          placeholder={`e.g. ${EXAMPLE_EXPERIENCES[(i * 7 + 2) % EXAMPLE_EXPERIENCES.length]}`}
          onChange={(ev) => setF({ ...f, experiences: f.experiences.map((x, j) => (j === i ? ev.target.value : x)) })} />
      ))}
      <span className="ctl-row">
        {editing && <button className="s-mini" onClick={() => { setOpen(false); onDone(); }}>Cancel</button>}
        <button className="s-mini solid" disabled={!f.name.trim()} onClick={save}>{editing ? 'Save' : 'Create'}</button>
      </span>
    </div>
  );
}

function CompanionSheet({ ch, onEdit }: { ch: Character; onEdit: () => void }) {
  const c = ch.companion!;
  const st = companionStats(ch);
  const d = derive(ch);
  const armed = usePlay((s) => s.armed[ch.id]) ?? armedFor(ch.id);
  const set = (fn: (x: Companion) => Companion) => updateCharacter(ch.id, (x) => ({ ...x, companion: fn(x.companion ?? newCompanion()) }));
  const spell = d.spellcastTraits.slice().sort((a, b) => d.traits[b] - d.traits[a])[0];
  const out = c.stress >= st.stressSlots;
  const attack = c.attack || 'Attack';
  const dmgText = `${d.proficiency}d${st.damageDie} ${c.damageType === 'magic' ? 'mag' : 'phy'}`;
  const rollDamage = (critical = false) => damage(`${c.name} · ${attack}`, { dice: [{ count: d.proficiency, sides: st.damageDie }], bonus: 0, critical },
    `${dmgText}${critical ? ' · critical' : ''}`, [], { charId: ch.id, magic: c.damageType === 'magic', attack: true });
  const comfortKey = 'rest:companion:creature-comfort';
  const comfortUsed = (ch.uses[comfortKey] ?? 0) >= 1;
  const reminders = [...new Set(companionPicks(c).map((p) => p.option))].filter((o) => o === 'armored' || o === 'bonded');
  return (
    <div className="feat" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="s-row" style={{ alignItems: 'flex-start' }}>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span className="s-feat-name">{c.name}</span>
          <span className="s-muted" style={{ fontSize: 13 }}>{[c.species, `${attack} · ${st.range}`].filter(Boolean).join(' · ')}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="s-label" style={{ fontSize: 13 }}>Evasion <span className="s-num" style={{ fontSize: 22 }}>{st.evasion}</span></span>
          <button className="s-icon s-press" aria-label="Edit companion" onClick={onEdit}><Icon d={ICONS.cog} size={22} /></button>
        </span>
      </div>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="s-label" style={{ fontSize: 13 }}>Stress</span>
        <Track label={`${c.name} Stress`} value={c.stress} max={st.stressSlots} total={st.stressSlots} size={26} onChange={(v) => set((x) => ({ ...x, stress: v }))} />
      </span>
      {out && <span className="s-muted" style={{ fontSize: 13 }}>{c.name} is out of the scene until your next long rest.</span>}
      <span style={{ display: 'flex', gap: 8 }}>
        <button className="s-mini solid" style={{ flex: 1 }} disabled={!spell || out}
          onClick={() => actionRoll(ch.id, `${c.name} · ${attack}`, [{ label: `Spellcast · ${cap(spell)}`, value: d.traits[spell] }, ...(d.spellcastBonus ? [{ label: 'Spellcast bonus', value: d.spellcastBonus }] : [])],
            'Spellcast Roll to command', { trait: spell, attack: true, damageFn: (o) => rollDamage(!!o.critical) })}>
          Spellcast {spell ? signed(d.traits[spell] + d.spellcastBonus) : ''}
        </button>
        <button className="s-mini" style={{ flex: 1 }} disabled={out} onClick={() => rollDamage()}>{attack} {d.proficiency}d{st.damageDie}</button>
      </span>
      {st.experiences.map((e, i) => {
        const key = `companion-exp:${i}`;
        const on = armed.arms.some((x) => x.key === key);
        return (
          <button key={i} className={`s-row s-press exp ${on ? 's-armed' : ''}`} aria-pressed={on} disabled={!on && ch.hope < 1 && !!e.name}
            onClick={() => (e.name ? toggleArm(ch.id, { key, label: `${e.name} +${e.value} · 1 Hope`, effect: { roll: e.value }, cost: { hope: 1 } }) : onEdit())}>
            <span>{e.name || 'New Companion Experience · tap to name it'}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="s-muted" style={{ fontSize: 13 }}>{on ? 'Armed · tap to refund' : ch.hope < 1 && e.name ? 'No Hope' : ''}</span>
              <span className="s-num" style={{ fontSize: 22 }}>+{e.value}</span>
            </span>
          </button>
        );
      })}
      {st.count('creature-comfort') > 0 && (
        <span className="ctl-row">
          <button className="s-mini" disabled={comfortUsed} onClick={() => { updateCharacter(ch.id, (x) => ({ ...withGain(x, { hope: 1 }), uses: { ...x.uses, [comfortKey]: 1 } })); toast('Creature Comfort: +1 Hope.'); }}>Creature Comfort · +1 Hope</button>
          <button className="s-mini" disabled={comfortUsed} onClick={() => { updateCharacter(ch.id, (x) => ({ ...withGain(x, { stress: 1 }), uses: { ...x.uses, [comfortKey]: 1 }, companion: { ...(x.companion ?? newCompanion()), stress: Math.max(0, (x.companion?.stress ?? 0) - 1) } })); toast('Creature Comfort: you both clear a Stress.'); }}>Both clear a Stress</button>
        </span>
      )}
      {st.allowed > companionPicks(c).length && <CatchUp ch={ch} need={st.allowed - companionPicks(c).length} />}
      {reminders.length > 0 && (
        <span className="s-muted" style={{ fontSize: 13, lineHeight: 1.4 }}>
          {reminders.includes('armored') && 'Armored: mark one of your Armor Slots instead of their Stress. '}
          {reminders.includes('bonded') && 'Bonded: when you mark your last Hit Point, roll a d6 per unmarked companion Stress; a 6 gets you up.'}
        </span>
      )}
    </div>
  );
}

/** Companion training: options marked at level-ups, as on the companion sheet (boxes show how many times each can be taken). */
export function CompanionTraining({ ch, need, value, onChange, level = ch.level + 1 }: {
  ch: Character; need: number; value: CompanionPick[]; onChange: (v: CompanionPick[]) => void; level?: number;
}) {
  const c = ch.companion!;
  const st = companionStats(ch);
  const options = classById.get('ranger')!.extras.companion!.levelUpOptions;
  const had = companionPicks(c);
  /** Vicious steps taken so far, not counting pick `skip`. */
  const steps = (kind: 'damage' | 'range', skip = -1) =>
    had.filter((p) => p.option === 'vicious' && (p.vicious === 'range') === (kind === 'range')).length
    + value.filter((p, j) => j !== skip && p.option === 'vicious' && (p.vicious === 'range') === (kind === 'range')).length;
  const edit = (i: number, p: Partial<CompanionPick>) => onChange(value.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <section className="stack-4" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="s-row"><span className="s-label">{c.name || 'Companion'} · training</span><span className="s-num" style={{ fontSize: 18 }}>{value.length} / {need}</span></div>
      <span className="s-muted" style={{ fontSize: 13 }}>Choose {need === 1 ? 'one option' : `${need} options`}. Tap again to undo.</span>
      {options.map((o) => {
        const max = TRAINING_MAX[o.id] ?? 1;
        const before = st.count(o.id);
        const mine = value.filter((p) => p.option === o.id).length;
        const full = before + mine >= max || (o.id === 'vicious' && steps('damage') >= 3 && steps('range') >= 4);
        const room = value.length < need && !full;
        const tap = () => {
          if (room) onChange([...value, { option: o.id, level, ...(o.id === 'intelligent' ? { experience: 0 } : {}), ...(o.id === 'vicious' ? { vicious: steps('damage') < 3 ? 'damage' as const : 'range' as const } : {}) }]);
          else if (mine) onChange(value.filter((_, j) => j !== value.map((p) => p.option).lastIndexOf(o.id)));
        };
        return (
          <div key={o.id} className={`adv-row ${!room && !mine ? 'dim' : ''}`}>
            <button className="adv-head" aria-pressed={mine > 0} disabled={!room && !mine} onClick={tap}>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{o.name}</span>
                <Rich text={o.text} style={{ fontSize: 13 }} />
              </span>
              <span className="adv-boxes" aria-hidden="true">
                {Array.from({ length: max }, (_, i) => <span key={i} className={`s-sq ${i >= before && i < before + mine ? 'on' : ''} ${i < before ? 'used' : ''}`} style={{ width: 24, height: 24 }} />)}
              </span>
            </button>
            {value.map((p, i) => {
              if (p.option === 'intelligent') {
                return o.id !== 'intelligent' ? null : (
                  <div key={i} className="pick-detail" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {st.experiences.map((e, k) => (
                      <button key={k} className={`s-mini ${p.experience === k ? 'solid' : ''}`} style={{ textTransform: 'none', letterSpacing: 0 }}
                        onClick={() => edit(i, { experience: k })}>{e.name || `Experience ${k + 1}`} +{e.value} → +{e.value + 1}</button>
                    ))}
                  </div>
                );
              }
              if (p.option === 'vicious' && o.id === 'vicious') {
                const dd = steps('damage', i), rr = steps('range', i);
                return (
                  <div key={i} className="pick-detail" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className={`s-mini ${p.vicious !== 'range' ? 'solid' : ''}`} disabled={dd >= 3} onClick={() => edit(i, { vicious: 'damage' })}>
                      Damage d{COMPANION_DICE[Math.min(3, dd)]} → d{COMPANION_DICE[Math.min(3, dd + 1)]}</button>
                    <button className={`s-mini ${p.vicious === 'range' ? 'solid' : ''}`} disabled={rr >= 4} onClick={() => edit(i, { vicious: 'range' })}>
                      Range {COMPANION_RANGES[Math.min(4, rr)]} → {COMPANION_RANGES[Math.min(4, rr + 1)]}</button>
                  </div>
                );
              }
              return null;
            })}
          </div>
        );
      })}
    </section>
  );
}

/** Training owed from levels before the companion was created: choose them here. */
function CatchUp({ ch, need }: { ch: Character; need: number }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<CompanionPick[]>([]);
  if (!open) return <button className="s-mini solid" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>Training · {need} to choose</button>;
  return (
    <>
      <CompanionTraining ch={ch} need={need} value={value} onChange={setValue} level={ch.level} />
      <span className="ctl-row">
        <button className="s-mini" onClick={() => { setOpen(false); setValue([]); }}>Cancel</button>
        <button className="s-mini solid" disabled={value.length < need} onClick={() => {
          updateCharacter(ch.id, (x) => ({ ...x, companion: { ...x.companion!, picks: [...companionPicks(x.companion!), ...value] } }));
          setOpen(false); setValue([]);
        }}>Save training</button>
      </span>
    </>
  );
}
