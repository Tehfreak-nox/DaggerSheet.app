import { useRef, useState } from 'react';
import { actionRoll, armedFor, armedText, clearArmed, showDice, toggleAdvantage, toggleExperience, usePlay } from '../app/play';
import { toast } from '../app/toast';
import { updateCharacter } from '../app/store';
import { go } from '../app/nav';
import { ancestries, cardById, classById, communityById, rules, type TraitId } from '../data';
import {
  ACTIVE, activeForm, ancestryFeatures, transformationOf, workingAncestryFeatures, avoidDeath, blazeOfGlory, derive, dropOut, hasBeastform, multiclassSubclass,
  mustMakeDeathMove, riskItAll, setHitPoints, splitClear, STAGES, subclassOf, TRAIT_IDS, wake,
  type Character,
} from '../rules';
import { TRAIT_VERBS } from '../theme/tables';
import { FeatureCard } from '../ui/FeatureCard';
import { CompanionPanel } from '../ui/Companion';
import { cap, DomainIcon, Icon, ICONS, Recall, Rich, signed, Title, Track } from '../ui/kit';

type Tab = 'class' | 'subclass' | 'heritage' | 'cards';
const TABS: Tab[] = ['class', 'subclass', 'heritage', 'cards'];

export function CharacterTab({ ch }: { ch: Character }) {
  const d = derive(ch);
  const armed = usePlay((s) => s.armed[ch.id]) ?? armedFor(ch.id);
  const set = (fn: (c: Character) => Character) => updateCharacter(ch.id, fn);
  const cls = classById.get(ch.classId)!;
  const hasArmed = armed.advantage !== 'none' || armed.experiences.length > 0 || armed.extras.length > 0 || armed.arms.length > 0 || !!armed.hopeDie || ch.death === 'blaze';
  const deathMove = mustMakeDeathMove(ch) || !!ch.death;
  const hopeFull = d.hopeSlots > 0 && ch.hope >= d.hopeSlots;

  const rollTrait = (t: TraitId) => actionRoll(ch.id, cap(t), [{ label: cap(t), value: d.traits[t] }], `2d12 ${signed(d.traits[t])}`, { trait: t });

  return (
    <main className="sheet-main">
      {/* Evasion · Armor · armor slots */}
      <section className="defense">
        <div className="s-emblem" style={{ width: 122 }} role="img" aria-label={`Evasion ${d.evasion}`}>
          <svg width="122" height="124" viewBox="0 0 122 124" aria-hidden="true">
            <path d="M2 44h16M0 58h12M2 72h16" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            <path d="M68 6L116 58 68 112 20 58Z" style={{ fill: "var(--surface)" }} stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
            <path d="M68 16L106 58 68 102 30 58Z" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
          <span className="s-num" style={{ left: 14, top: 34 }}>{d.evasion}</span>
          <span className="s-bar" style={{ left: 14, right: -4 }}>Evasion</span>
        </div>
        <ArmorShield score={d.armorScore} />
        <div className="stack-4" style={{ alignItems: 'center' }}>
          <Track label="Armor slots" value={ch.armorMarked} max={(ch.active ?? []).some((k) => ACTIVE[k]?.noArmorSlots) ? 0 : d.armorScore} total={rules.caps.armorScore} columns={3} countdown
            onChange={(v) => set((c) => ({ ...c, armorMarked: v }))} />
          <span className="s-label s-muted" style={{ fontSize: 11 }}>{d.armorScore - ch.armorMarked} / {d.armorScore} left</span>
        </div>
      </section>

      {/* Traits */}
      <section className="stack-14">
        <Title>Traits</Title>
        {hasArmed && (
          <div className="s-row armed-bar">
            <span style={{ fontSize: 14, lineHeight: 1.35 }}><b>Next roll:</b> {armedText(ch.id)}</span>
            <button className="s-mini" onClick={() => clearArmed(ch.id)}>Clear</button>
          </div>
        )}
        <div className="traits">
          {TRAIT_IDS.map((t) => (
            <button key={t} className="s-trait s-press" onClick={() => rollTrait(t)} aria-label={`Roll ${t}: 2d12 ${signed(d.traits[t])}`}>
              <span className="tab">{t}</span>
              <span className="face" style={ch.markedTraits.includes(t) ? { boxShadow: 'inset 0 -4px 0 var(--accent)' } : undefined}>
                <span className="s-num">{signed(d.traits[t])}</span>
              </span>
              <span className="verbs">{TRAIT_VERBS[t].map((v) => <span key={v}>{v}</span>)}</span>
            </button>
          ))}
        </div>
        <AdvDis id={ch.id} />
      </section>

      {/* Health */}
      <section className="stack-18">
        <Title>Health</Title>
        {deathMove ? <DeathPanel ch={ch} /> : <>
        <div className="s-thr" role="img" aria-label={`Damage thresholds: Major ${d.thresholds.major}, Severe ${d.thresholds.severe}`}>
          <span className="box">Minor</span><span className="n">{d.thresholds.major}</span>
          <span className="box" style={{ paddingLeft: 6 }}>Major</span><span className="n">{d.thresholds.severe}</span>
          <span className="box" style={{ paddingLeft: 6 }}>Severe</span>
          <span className="cap">Mark 1 HP</span><span /><span className="cap">Mark 2 HP</span><span /><span className="cap">Mark 3 HP</span>
        </div>
        <div className="stack-4">
          <div className="s-row"><span className="s-label">HP</span><span className="s-num s-muted" style={{ fontSize: 16 }}>{d.hitPoints - ch.hp} / {d.hitPoints} left</span></div>
          <Track label="Hit Points" value={ch.hp} max={d.hitPoints} total={rules.caps.hitPointSlots} countdown onChange={(v) => set((c) => setHitPoints(c, v))} />
        </div>
        <div className="stack-4">
          <div className="s-row"><span className="s-label">Stress</span><span className="s-num s-muted" style={{ fontSize: 16 }}>{d.stressSlots - ch.stress} / {d.stressSlots} left</span></div>
          <Track label="Stress" value={ch.stress} max={d.stressSlots} total={rules.caps.stressSlots} countdown onChange={(v) => set((c) => ({ ...c, stress: v }))} />
        </div>
        </>}
      </section>

      {/* Experience + Hope */}
      <section className="stack-6">
        <Title style={{ marginBottom: 4 }}>Experience</Title>
        <span className="s-muted" style={{ fontSize: 13, marginBottom: 4 }}>Tap one to spend 1 Hope and add it to your next roll. Tap another to switch.</span>
        {d.experiences.map((x, i) => {
          const on = armed.experiences.includes(i);
          return (
            <button key={i} className={`s-row s-press exp ${on ? 's-armed' : ''}`} aria-pressed={on}
              disabled={!on && !armed.experiences.length && ch.hope < 1} onClick={() => toggleExperience(ch.id, i)}>
              <span>{x.name}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="s-muted" style={{ fontSize: 13 }}>{on ? 'Armed · tap to refund' : armed.experiences.length ? 'Tap to switch' : ch.hope < 1 ? 'No Hope' : ''}</span>
                <span className="s-num" style={{ fontSize: 22 }}>+{x.value}</span>
              </span>
            </button>
          );
        })}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="s-label" style={{ fontSize: 18 }}>Hope</span>
          <Track label="Hope" value={ch.hope} max={d.hopeSlots} total={d.hopeSlots} size={28} onChange={(v) => set((c) => ({ ...c, hope: v }))} />
          <Scars ch={ch} />
        </div>
        {hopeFull && <p className="callout" role="status">Your Hope is full: spend it before your next roll with Hope, or that Hope is lost.</p>}
        <span className="s-muted" style={{ fontSize: 14, lineHeight: 1.4 }}>Spend 1 Hope to use an Experience or help an ally. Spend 3 Hope for a Tag Team Roll with an ally.</span>
        <div className="hope-feature">
          {cls.hopeFeature.id === 'evolution'
            ? <BeastformCard ch={ch} name={cls.hopeFeature.name} text={cls.hopeFeature.text} tag="Hope feature" via="evolution" />
            : <FeatureCard ch={ch} featureKey={`hope:${cls.id}`} name={cls.hopeFeature.name} text={cls.hopeFeature.text} tag="Hope feature" />}
        </div>
      </section>

      <FeaturesPanel ch={ch} />
    </main>
  );
}

export function AdvDis({ id, compact }: { id: string; compact?: boolean }) {
  const a = usePlay((s) => s.armed[id]) ?? armedFor(id);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {(['advantage', 'disadvantage'] as const).map((k) => (
        <button key={k} className={`s-mini ${a.advantage === k ? 'solid' : ''}`} style={{ minWidth: 60, minHeight: 44, fontSize: 15 }}
          aria-pressed={a.advantage === k} onClick={() => toggleAdvantage(id, k)}>
          {k === 'advantage' ? 'Adv' : 'Dis'}
        </button>
      ))}
      {!compact && <span className="s-muted" style={{ fontSize: 13, lineHeight: 1.3 }}>
        {a.advantage === 'none' ? 'Arm for your next roll only.' : `${a.advantage === 'advantage' ? '+1d6' : '−1d6'} on your next roll.`}
      </span>}
    </div>
  );
}

export function ArmorShield({ score, small }: { score: number; small?: boolean }) {
  const w = small ? 96 : 116, h = small ? 104 : 124;
  return (
    <div className="s-emblem" style={{ width: w, height: h }} role="img" aria-label={`Armor score ${score}`}>
      <svg width={w} height={h} viewBox="0 0 116 124" aria-hidden="true">
        <path d="M58 6L100 18Q106 60 96 86L58 118 20 86Q10 60 16 18Z" style={{ fill: "var(--surface)" }} stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M58 14L92 24Q96 60 88 82L58 108 28 82Q20 60 24 24Z" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
      <span className="s-num" style={small ? { top: 22, fontSize: 38 } : undefined}>{score}</span>
      <span className="s-bar" style={small ? { bottom: 16, height: 22, fontSize: 12 } : undefined}>Armor</span>
    </div>
  );
}

function FeaturesPanel({ ch }: { ch: Character }) {
  const [tab, setTab] = useState<Tab>('class');
  const start = useRef<{ x: number; y: number } | null>(null);
  const cls = classById.get(ch.classId)!;
  const sub = subclassOf(ch);
  const mcSub = multiclassSubclass(ch);
  const mcCls = ch.multiclass ? classById.get(ch.multiclass.classId) : undefined;
  const stageIdx = STAGES.indexOf(ch.subclassStage);
  const [a1, a2] = ancestryFeatures(ch);
  const tf = transformationOf(ch);
  const com = communityById.get(ch.communityId)!;
  const idx = TABS.indexOf(tab);

  const onDown = (e: React.PointerEvent) => { start.current = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setTab(TABS[Math.max(0, Math.min(3, idx + (dx < 0 ? 1 : -1)))]);
    }
  };

  const ancestryName = 'id' in ch.ancestry ? undefined : 'Mixed ancestry';

  return (
    <section className="stack-16">
      <Title>Features</Title>
      <div className="s-pills" role="tablist" aria-label="Features">
        {TABS.map((t) => (
          <button key={t} role="tab" className={`s-pill ${tab === t ? 'on' : ''}`} aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === 'heritage' ? 'Heritage' : cap(t)}
          </button>
        ))}
      </div>
      <div className={`fx fx-${ch.communityId}`}>
        <div className="fx-in">
          <div className="features" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { start.current = null; }}>
            {tab === 'class' && (
              <>
                {cls.features.map((f) => f.id === 'beastform'
                  ? <BeastformCard key={f.id} ch={ch} name={f.name} text={f.text} via="beastform" />
                  : <FeatureCard key={f.id} ch={ch} featureKey={`class:${f.id}`} name={f.name} text={f.text} note={f.note} />)}
                {mcCls && (
                  <>
                    <span className="s-label panel-head">Multiclass · {mcCls.name}</span>
                    {mcCls.features.map((f) => f.id === 'beastform'
                      ? <BeastformCard key={f.id} ch={ch} name={f.name} text={f.text} via="beastform" />
                      : <FeatureCard key={f.id} ch={ch} featureKey={`mc:${f.id}`} name={f.name} text={f.text} note={f.note} />)}
                  </>
                )}
                <ClassExtras ch={ch} />
              </>
            )}
            {tab === 'subclass' && (
              <>
                <span className="s-label panel-head">{sub.name}{sub.spellcastTrait ? ` · Spellcast: ${cap(sub.spellcastTrait)}` : ''}</span>
                {STAGES.filter((_, si) => si <= stageIdx).flatMap((stage) => sub[stage].map((f) => (
                  <FeatureCard key={stage + f.id} ch={ch} featureKey={`sub:${f.id}`} name={f.name} text={f.text} tag={cap(stage)} />
                )))}
                {mcSub && (
                  <>
                    <span className="s-label panel-head">{mcSub.name} (multiclass)</span>
                    {mcSub.foundation.map((f) => (
                      <FeatureCard key={f.id} ch={ch} featureKey={`mcsub:${f.id}`} name={f.name} text={f.text} tag="Foundation" />
                    ))}
                  </>
                )}
              </>
            )}
            {tab === 'heritage' && (
              <>
                <span className="s-label panel-head">{ancestryName ?? cap(('id' in ch.ancestry && ch.ancestry.id) || '')}</span>
                {[a1, a2].map((f) => {
                  const off = !workingAncestryFeatures(ch).some((x) => x.id === f.id);
                  return (
                    <FeatureCard key={f.id} ch={ch} featureKey={`anc:${f.id}`} name={f.name} text={f.text} ghost={off}
                      tag={tf?.id === 'shapeshifter' ? (off ? 'Not in use' : 'In use') : undefined}
                      extra={tf?.id === 'shapeshifter' && off ? <button className="s-mini" style={{ alignSelf: 'flex-start' }}
                        onClick={() => updateCharacter(ch.id, (c) => ({ ...c, picks: { ...c.picks, shapeshifter: f.id } }))}>Use this one (downtime move)</button> : undefined} />
                  );
                })}
                {tf?.id === 'shapeshifter' && <ShapeshiftAncestry ch={ch} />}
                <span className="s-label panel-head">{com.name}</span>
                <FeatureCard ch={ch} featureKey={`com:${com.feature.id}`} name={com.feature.name} text={com.feature.text} />
                {tf && (
                  <>
                    <span className="s-label panel-head">{tf.name} · Transformation</span>
                    {tf.features.map((f) => <FeatureCard key={f.id} ch={ch} featureKey={`tf:${f.id}`} name={f.name} text={f.text} />)}
                  </>
                )}
              </>
            )}
            {tab === 'cards' && <CardsTab ch={ch} />}
            <div className="dots" aria-hidden="true">
              {TABS.map((t) => <span key={t} className={tab === t ? 'on' : ''} />)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CardsTab({ ch }: { ch: Character }) {
  const loadout = ch.cards.loadout.map((id) => cardById.get(id)!).filter(Boolean);
  return (
    <>
      <div className="s-row">
        <span className="s-muted" style={{ fontSize: 15 }}>Loadout {loadout.length} / {rules.caps.loadout} · Vault {ch.cards.vault.length}</span>
        <button className="s-btn s-press" aria-label="Manage cards in the vault" style={{ minWidth: 48, padding: '0 12px' }} onClick={() => go({ name: 'vault', id: ch.id })}>
          <Icon d={ICONS.cog} size={20} />
        </button>
      </div>
      {loadout.length === 0 && <span className="s-muted">No cards in your loadout. Open the vault to move some in.</span>}
      {loadout.map((c) => (
        <FeatureCard key={c.id} ch={ch} featureKey={`card:${c.id}`} name={c.name} text={c.text}
          meta={`${cap(c.domain)} · Level ${c.level} ${cap(c.type)}`}
          aside={<span style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 'none' }}><DomainIcon domain={c.domain} /><Recall cost={c.recallCost} size={36} /></span>} />
      ))}
    </>
  );
}

function ClassExtras({ ch }: { ch: Character }) {
  const cls = classById.get(ch.classId)!;
  const ex = cls.extras;
  const d = derive(ch);
  const [open, setOpen] = useState(false);
  if (ex.martialStances && ch.subclassId === 'martial-artist') {
    // Two Tier 1 stances when you take the foundation, one more each level.
    const known = ch.picks.stances ?? [];
    const max = 2 + Math.max(0, ch.level - 1);
    const all = ex.martialStances.stances;
    const learn = (sid: string, on: boolean) => updateCharacter(ch.id, (c) => ({ ...c, picks: { ...c.picks, stances: on ? [...(c.picks.stances ?? []), sid] : (c.picks.stances ?? []).filter((x) => x !== sid) } }));
    return (
      <>
        <span className="s-label panel-head">Martial stances · {known.length}/{max} known</span>
        {all.filter((st) => known.includes(st.id)).map((st) => (
          <FeatureCard key={st.id} ch={ch} featureKey={`stance:${st.id}`} name={st.name} text={st.text} meta={`Tier ${st.tier}`} />
        ))}
        <Expander title={known.length ? 'Learn or forget stances' : 'Choose your stances'} open={open || !known.length} onToggle={() => setOpen(!open)}>
          {all.filter((st) => st.tier <= d.tier).map((st) => {
            const has = known.includes(st.id);
            return (
              <div key={st.id} className="s-row" style={{ alignItems: 'flex-start', gap: 10 }}>
                <span style={{ flex: 1, fontSize: 14, lineHeight: 1.4 }}><b>{st.name}</b> <span className="s-muted">Tier {st.tier}</span><br /><Rich text={st.text} /></span>
                <button className={`s-mini ${has ? 'solid' : ''}`} aria-pressed={has} disabled={!has && (known.length >= max || (known.length < 2 && st.tier > 1))}
                  onClick={() => learn(st.id, !has)}>{has ? 'Known' : 'Learn'}</button>
              </div>
            );
          })}
        </Expander>
      </>
    );
  }
  if (ex.companion && ch.subclassId === 'beastbound') {
    return (
      <>
      <span className="s-label panel-head">Companion</span>
      <CompanionPanel ch={ch} />
      <Expander title="Companion rules" open={open} onToggle={() => setOpen(!open)}>
        {[...ex.companion.steps, ...ex.companion.rules].map((s) => (
          <FeatureCard key={s.title} ch={ch} featureKey={`comp:${s.title}`} name={s.title || 'Companion'} text={s.text} />
        ))}
      </Expander>
      </>
    );
  }
  return null;
}

function Expander({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="stack-16">
      <button className="s-btn s-press" aria-expanded={open} onClick={onToggle} style={{ justifyContent: 'space-between' }}>
        <span>{title}</span>
        <Icon d={ICONS.chevron} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && children}
    </div>
  );
}

/** Avoid Death scars: crossed-out Hope slots. Tap one for what it means. */
function Scars({ ch }: { ch: Character }) {
  const [open, setOpen] = useState(false);
  const n = ch.scars ?? 0;
  if (!n) return null;
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <button key={i} className="scar-slot" aria-label="Scarred Hope slot: what this means" aria-expanded={open} onClick={() => setOpen(!open)}>
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" rx="3" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" /><path d="M5 23L23 5M9 5l3 6-4 3 6 9" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
        </button>
      ))}
      {open && (
        <div className="callout stack-6" style={{ flexBasis: '100%' }}>
          <span><b>Scar{n > 1 ? `s (${n})` : ''}.</b> Avoid Death crossed out {n > 1 ? 'these Hope slots' : 'this Hope slot'} for good. Work with your GM on its lasting narrative impact and how, if possible, it can be restored, perhaps through a quest.</span>
          <button className="s-mini" style={{ alignSelf: 'flex-start' }} onClick={() => { updateCharacter(ch.id, (c) => ({ ...c, scars: Math.max(0, (c.scars ?? 0) - 1) })); setOpen(false); }}>Restore a slot (GM approved)</button>
        </div>
      )}
    </>
  );
}

/** The death moves, shown in place of the health tracks once your last Hit Point is marked. */
function DeathPanel({ ch }: { ch: Character }) {
  const [split, setSplit] = useState<{ points: number; before: Character; toHp: number } | null>(null);
  const set = (c: Character) => updateCharacter(ch.id, () => c);
  const death = rules.death;
  const move = (id: string) => death.moves.find((m) => m.id === id)!;

  if (ch.death === 'unconscious') {
    return (
      <div className="death stack-10">
        <span className="s-label" style={{ fontSize: 18 }}>Unconscious</span>
        <span className="s-feat-text">You can’t move or act, and you can’t be targeted by an attack. You return to consciousness when an ally clears 1 or more of your marked Hit Points or when the party finishes a long rest.</span>
        <button className="s-btn solid s-press" onClick={() => set(wake(ch))}>An ally cleared a Hit Point</button>
      </div>
    );
  }
  if (ch.death === 'blaze') {
    return (
      <div className="death stack-10">
        <span className="s-label" style={{ fontSize: 18 }}>Blaze of Glory</span>
        <span className="s-feat-text">Take one final action: your next action roll automatically critically succeeds (with GM approval). Then you cross through the veil of death.</span>
        <button className="s-mini" style={{ alignSelf: 'flex-start' }} onClick={() => set({ ...ch, death: undefined })}>Choose another death move</button>
      </div>
    );
  }
  const riskHope = ch.uses['death:riskHope'] ?? 0;
  if (ch.death === 'dead') {
    return (
      <div className="death stack-10">
        <span className="s-label" style={{ fontSize: 18 }}>Beyond the veil</span>
        <span className="s-feat-text">{(ch.scars ?? 0) >= rules.caps.hope ? 'Your last Hope slot is crossed out: your character’s journey ends.' : 'Your character has crossed through the veil of death.'}</span>
        {ch.transformation === 'reanimated' && riskHope > 0 && (
          <button className="s-btn solid s-press" onClick={() => {
            const permanentHp = (ch.permanentHp ?? 0) + 1;
            const { 'death:riskHope': _, ...uses } = ch.uses;
            const revived: Character = { ...ch, permanentHp, uses, death: undefined };
            if (derive(revived).hitPoints <= permanentHp) { set({ ...revived, death: 'dead', uses }); toast('Your last Hit Point is permanently marked: you pass through the veil of death.'); return; }
            set(splitClear(revived, riskHope, Math.min(riskHope, revived.hp)));
            setSplit({ points: riskHope, before: revived, toHp: Math.min(riskHope, revived.hp) });
          }}>Won’t Stay Dead · permanently mark a Hit Point to succeed</button>
        )}
        <button className="s-mini" style={{ alignSelf: 'flex-start' }} onClick={() => set({ ...ch, death: undefined })}>Undo (GM ruling)</button>
      </div>
    );
  }
  if (split) {
    const toStress = split.points - split.toHp;
    const apply = (toHp: number) => { setSplit({ ...split, toHp }); set(splitClear(split.before, split.points, toHp)); };
    return (
      <div className="death stack-10">
        <span className="s-label" style={{ fontSize: 18 }}>Risk It All · you stay on your feet</span>
        <span className="s-feat-text">Divide your Hope Die ({split.points}) between Hit Points and Stress.</span>
        <div className="s-row">
          <button className="s-mini" disabled={split.toHp <= 0} onClick={() => apply(split.toHp - 1)}>− HP</button>
          <span style={{ fontSize: 16 }}><b>{split.toHp}</b> HP · <b>{toStress}</b> Stress</span>
          <button className="s-mini" disabled={split.toHp >= split.points} onClick={() => apply(split.toHp + 1)}>+ HP</button>
        </div>
        <button className="s-btn solid s-press" onClick={() => setSplit(null)}>Done</button>
      </div>
    );
  }
  const hardened = ch.cards.loadout.includes('blade-battle-hardened');
  const hardenedKey = 'longRest:card:blade-battle-hardened';
  const unbreakable = ch.cards.loadout.includes('valor-unbreakable');
  return (
    <div className="death stack-14">
      {(hardened || unbreakable) && (
        <div className="stack-6 callout">
          {hardened && (
            <button className="s-btn s-press" disabled={ch.hope < 1 || (ch.uses[hardenedKey] ?? 0) >= 1}
              onClick={() => set({ ...ch, hope: ch.hope - 1, hp: Math.max(0, ch.hp - 1), uses: { ...ch.uses, [hardenedKey]: 1 } })}>
              Battle-Hardened · spend a Hope to clear a Hit Point instead
            </button>
          )}
          {unbreakable && (
            <button className="s-btn s-press" onClick={() => {
              const v = 1 + Math.floor(Math.random() * 6);
              set({ ...ch, hp: Math.max(0, ch.hp - v), cards: { loadout: ch.cards.loadout.filter((x) => x !== 'valor-unbreakable'), vault: [...ch.cards.vault, 'valor-unbreakable'] } });
              showDice('Unbreakable', [v], ['d6'], [`You clear ${v} Hit Point${v === 1 ? '' : 's'} instead of making a death move. Unbreakable goes to your vault.`]);
            }}>Unbreakable · roll a d6 and clear that many Hit Points</button>
          )}
        </div>
      )}
      <span className="s-feat-text" style={{ fontWeight: 700 }}>{death.intro}</span>
      <div className="stack-6">
        <span className="s-feat-name">{move('blaze-of-glory').name}</span>
        <span className="s-feat-text">{move('blaze-of-glory').text}</span>
        <button className="s-btn s-press" onClick={() => { set(blazeOfGlory(ch)); toast('Your next action roll is a critical success.'); }}>Blaze of Glory</button>
      </div>
      <hr className="sep" />
      <div className="stack-6">
        <span className="s-feat-name">{move('avoid-death').name}</span>
        <span className="s-feat-text">{move('avoid-death').text}</span>
        <button className="s-btn s-press" onClick={() => {
          const r = avoidDeath(ch);
          set(r.character);
          showDice('Avoid Death', [r.hopeDie], ['Hope'], [
            r.journeyEnds ? 'You gain a scar on your last Hope slot: your journey ends.'
              : r.scarred ? `${r.hopeDie} is at or under your level (${ch.level}): you gain a scar and lose a Hope slot.`
              : `${r.hopeDie} is over your level (${ch.level}): no scar.`,
            'You drop unconscious.',
          ]);
        }}>Avoid Death · roll your Hope Die</button>
      </div>
      <hr className="sep" />
      <div className="stack-6">
        <span className="s-feat-name">{move('risk-it-all').name}</span>
        <span className="s-feat-text">{move('risk-it-all').text}</span>
        <button className="s-btn s-press" onClick={() => {
          const r = riskItAll(ch);
          // Reanimated "Won't Stay Dead" can turn a failure into a success: keep the Hope Die for it.
          set(r.outcome === 'dead' && ch.transformation === 'reanimated' ? { ...r.character, uses: { ...r.character.uses, 'death:riskHope': r.hope } } : r.character);
          showDice('Risk It All', [r.hope, r.fear], ['Hope', 'Fear'], [
            r.outcome === 'all' ? 'Matching dice: you stay up and clear all Hit Points and Stress.'
              : r.outcome === 'dead' ? 'The Fear Die is higher: you cross through the veil of death.'
              : `The Hope Die is higher: you stay on your feet and clear ${r.hope} Hit Points or Stress.`,
          ]);
          if (r.outcome === 'clear') {
            const { beastform: _, ...before } = ch;
            setSplit({ points: r.hope, before, toHp: Math.min(r.hope, ch.hp) });
          }
        }}>Risk It All · roll your Duality Dice</button>
      </div>
    </div>
  );
}

/** Beastform (class feature) or Evolution (Hope feature). The cog opens the form window; while transformed it becomes a cancel mark. */
function BeastformCard({ ch, name, text, tag, via }: { ch: Character; name: string; text: string; tag?: string; via: 'beastform' | 'evolution' }) {
  const current = activeForm(ch);
  return (
    <article className="feat">
      <div className="s-row" style={{ alignItems: 'flex-start' }}>
        <span className="s-feat-name">{name}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {tag && <span className="s-label s-muted" style={{ fontSize: 12 }}>{tag}</span>}
          {via === 'beastform' && (current ? (
            <button className="s-icon s-press" style={{ width: 44, height: 44 }} aria-label={`Drop out of Beastform (${current.name})`}
              onClick={() => { updateCharacter(ch.id, dropOut); toast('You drop out of Beastform.'); }}>
              <Icon d={ICONS.cancel} size={24} />
            </button>
          ) : (
            <button className="s-icon s-press" style={{ width: 44, height: 44 }} aria-label="Choose a Beastform" onClick={() => go({ name: 'beastform', id: ch.id, via: 'beastform' })}>
              <Icon d={ICONS.cog} size={20} />
            </button>
          ))}
        </span>
      </div>
      <Rich text={text} />
      {via === 'beastform' && current && (
        <div className="beast-on">
          <span style={{ flex: 1, fontSize: 15 }}>
            <b>In Beastform: {current.name}</b>
            {current.trait ? ` · ${cap(current.trait)} ${signed(current.traitBonus)}` : ''} · Evasion {signed(current.evasionBonus)}
            {current.thresholdBonus ? ` · thresholds ${signed(current.thresholdBonus)}` : ''}
            {ch.beastform?.evolution ? ` · ${cap(ch.beastform.evolution)} +1 (Evolution)` : ''}
          </span>
        </div>
      )}
      {via === 'evolution' && (
        <button className="s-mini solid" style={{ alignSelf: 'flex-start' }} disabled={ch.hope < 3 || !hasBeastform(ch)}
          onClick={() => go({ name: 'beastform', id: ch.id, via: 'evolution' })}>Use · 3 Hope</button>
      )}
    </article>
  );
}

/** Shapeshifter "Change Shape": during a rest, swap your ancestry for another. */
function ShapeshiftAncestry({ ch }: { ch: Character }) {
  const current = 'id' in ch.ancestry ? ch.ancestry.id : '';
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className="s-label" style={{ fontSize: 12 }}>Change Shape (downtime move)</span>
      <select className="s-field" style={{ width: 'auto', minHeight: 40 }} value={current}
        onChange={(e) => updateCharacter(ch.id, (c) => ({ ...c, ancestry: { id: e.target.value }, picks: { ...c.picks, shapeshifter: undefined } }))}>
        {!current && <option value="">Mixed ancestry</option>}
        {ancestries.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
  );
}
