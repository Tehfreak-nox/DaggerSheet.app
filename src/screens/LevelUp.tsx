import { Fragment, useMemo, useState } from 'react';
import { back } from '../app/nav';
import { saveCharacter, useStore } from '../app/store';
import { classById, classes, rules, type Advancement, type DomainId, type TraitId } from '../data';
import {
  companionPicks, hasCompanion, trainingAllowed, type CompanionPick,
  achievementAt, advancementCapped, applyLevelUp, derive, extraCardsFor, legalCards, levelUpProblems, slotFor, STAGES, subclassOf, tierOf, TRAIT_IDS,
  type AdvancementChoice, type AdvancementMark, type Character, type LevelUpChoices,
} from '../rules';
import { themeAttrs } from '../ui/Header';
import { cap, DomainIcon, Page, Recall, Rich, signed } from '../ui/kit';
import { CompanionTraining } from '../ui/Companion';

interface Pick {
  id: Advancement['id'];
  traits: TraitId[];
  experiences: number[];
  card: string;
  mcClass: string;
  mcDomain: string;
  mcSub: string;
}

const blank = (id: Advancement['id']): Pick => ({ id, traits: [], experiences: [], card: '', mcClass: '', mcDomain: '', mcSub: '' });

function toChoice(p: Pick): AdvancementChoice {
  switch (p.id) {
    case 'traits': return { id: 'traits', traits: [p.traits[0], p.traits[1]] as [TraitId, TraitId] };
    case 'experiences': return { id: 'experiences', experiences: [p.experiences[0], p.experiences[1]] as [number, number] };
    case 'domainCard': return { id: 'domainCard', card: p.card };
    case 'multiclass': return { id: 'multiclass', classId: p.mcClass, domain: p.mcDomain as DomainId, subclassId: p.mcSub };
    default: return { id: p.id } as AdvancementChoice;
  }
}

const SHORT: Record<Advancement['id'], string> = {
  traits: '+1 to two unmarked traits', hitPoint: '+1 Hit Point slot', stress: '+1 Stress slot',
  experiences: '+1 to two Experiences', domainCard: 'An extra domain card', evasion: '+1 Evasion',
  subclass: 'Upgraded subclass card', proficiency: '+1 Proficiency (both slots)', multiclass: 'Multiclass (both slots)',
};

export function LevelUp({ id }: { id: string }) {
  const ch = useStore((s) => s.characters[id]);
  const [exp, setExp] = useState('');
  const [picks, setPicks] = useState<Pick[]>([]);
  const [card, setCard] = useState('');
  const [extra, setExtra] = useState<string[]>([]);
  const [vitality, setVitality] = useState<('stress' | 'hitPoint' | 'thresholds')[]>([]);
  const [master, setMaster] = useState<number[]>([]);
  const [done, setDone] = useState<Character | null>(null);
  const [train, setTrain] = useState<CompanionPick[]>([]);
  if (!ch) return null;

  const level = ch.level + 1;
  const tier = tierOf(level);
  const ach = achievementAt(level);
  const d = derive(ch);
  const cost = picks.reduce((a, p) => a + (rules.leveling.advancements.find((x) => x.id === p.id)!.cost), 0);
  const choices: LevelUpChoices = {
    newExperience: ach ? exp : undefined,
    advancements: picks.map(toChoice),
    domainCard: card,
    extraCards: extra,
    picks: { ...(vitality.length ? { vitality } : {}), ...(master.length ? { masterOfTheCraft: { experiences: master } } : {}) },
  };
  // Companion training: picks this level-up must make (an upgraded subclass card here can add Expert or Advanced Training).
  const stageAfter = picks.some((p) => p.id === 'subclass') ? STAGES[Math.min(2, STAGES.indexOf(ch.subclassStage) + 1)] : ch.subclassStage;
  const trainNeed = ch.companion && hasCompanion(ch) ? Math.max(0, trainingAllowed(ch, level, stageAfter) - companionPicks(ch.companion).length) : 0;
  const problems = level > 10 ? ['Already at level 10.'] : [
    ...levelUpProblems(ch, choices),
    ...(train.length < trainNeed ? [`Choose ${trainNeed - train.length} more companion training option${trainNeed - train.length > 1 ? 's' : ''}.`] : []),
  ];
  const marks: AdvancementMark[] = [...ch.advancements, ...picks.map((p) => ({ level, tier: (slotFor(ch.advancements, level, p.id) ?? 2) as 2 | 3 | 4, choice: toChoice(p) }))];
  const expNames = [...ch.experiences.map((e) => e.name), ...(ach ? [exp || 'New Experience'] : [])];
  const expVals = [...d.experiences.map((e) => e.value), ...(ach ? [2] : [])];
  const newCardIds = [...picks.filter((p) => p.id === 'domainCard').map((p) => p.card), card, ...extra].filter(Boolean);
  const needExtra = extraCardsFor(ch, choices.advancements);
  const mcPick = picks.find((p) => p.id === 'multiclass');
  const simForCards: Character = mcPick && mcPick.mcClass && mcPick.mcDomain
    ? { ...ch, multiclass: { classId: mcPick.mcClass, domain: mcPick.mcDomain as DomainId, subclassId: mcPick.mcSub, level } }
    : ch;

  if (done) {
    const nd = derive(done);
    return (
      <div className="s" {...themeAttrs(done)}>
        <Page title={`Level ${done.level}`} onClose={back} closeLabel="Done">
          <div className="stack-10">
            {[
              ['Proficiency', `${d.proficiency} → ${nd.proficiency}`],
              ['Thresholds', `${d.thresholds.major}/${d.thresholds.severe} → ${nd.thresholds.major}/${nd.thresholds.severe}`],
              ['Hit Points', `${d.hitPoints} → ${nd.hitPoints}`],
              ['Stress', `${d.stressSlots} → ${nd.stressSlots}`],
              ['Evasion', `${d.evasion} → ${nd.evasion}`],
              ['Subclass', `${cap(ch.subclassStage)} → ${cap(done.subclassStage)}`],
              ['Cards', `${ch.cards.loadout.length + ch.cards.vault.length} → ${done.cards.loadout.length + done.cards.vault.length}`],
            ].map(([k, v]) => (
              <div key={k} className="s-row" style={{ minHeight: 44, borderBottom: '1px solid var(--line)' }}><span>{k}</span><span className="s-label">{v}</span></div>
            ))}
            <button className="s-btn solid s-press" style={{ minHeight: 52 }} onClick={back}>Back to your sheet</button>
          </div>
        </Page>
      </div>
    );
  }

  const toggle = (a: Advancement) => {
    const mine = picks.filter((p) => p.id === a.id);
    // Tapping a chosen option removes it; otherwise add it if there's room.
    if (advancementCapped(ch, a.id, level) && !mine.length) return;
    if (mine.length && (cost + a.cost > 2 || !slotFor(marks, level, a.id) || a.id === 'subclass' || a.id === 'proficiency' || a.id === 'multiclass')) {
      const i = picks.map((p) => p.id).lastIndexOf(a.id);
      setPicks(picks.filter((_, j) => j !== i));
      return;
    }
    if (cost + a.cost <= 2 && slotFor(marks, level, a.id)) setPicks([...picks, blank(a.id)]);
  };
  const edit = (i: number, p: Partial<Pick>) => setPicks(picks.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <div className="s" {...themeAttrs(ch)}>
      <Page title="Level up" onClose={back}>
        <span className="s-feat-text" style={{ fontSize: 15 }}>Level {ch.level} → <b>Level {level}</b> · Tier {tier}</span>

        {ach && (
          <section className="stack-8">
            <span className="s-label">Step 1 · Tier achievements</span>
            <span className="s-feat-text" style={{ fontSize: 15 }}>
              Gain a new Experience at +2 and permanently increase your Proficiency by 1{ach.clearMarkedTraits ? ', and clear your marked traits' : ''}.
            </span>
            <label className="s-label s-muted" style={{ fontSize: 13 }} htmlFor="lv-exp">New Experience</label>
            <input id="lv-exp" className="s-field" value={exp} onChange={(e) => setExp(e.target.value)} placeholder="e.g. Survived the Ember Rift" autoComplete="off" />
          </section>
        )}

        <section className="stack-4">
          <div className="s-row"><span className="s-label">Step {ach ? 2 : 1} · Choose two advancements</span><span className="s-num" style={{ fontSize: 18 }}>{cost} / 2</span></div>
          <span className="s-muted" style={{ fontSize: 13 }}>Any option with an unmarked slot from tier {tier} or below. Tap a box to choose, tap again to undo.</span>
          {rules.leveling.advancements.filter((a) => a.minTier <= tier).map((a) => {
            const chosen = picks.filter((p) => p.id === a.id).length;
            const capped = advancementCapped(ch, a.id, level);
            const avail = slotFor(ch.advancements, level, a.id) !== null && !capped;
            const t = String(tier) as '2' | '3' | '4';
            const total = a.slots[t];
            const usedHere = ch.advancements.filter((m) => m.tier === tier && m.choice.id === a.id).length * a.cost;
            return (
              <div key={a.id} className={`adv-row ${!avail && !chosen ? 'dim' : ''}`}>
                <button className="adv-head" disabled={!avail && !chosen} aria-pressed={chosen > 0}
                  aria-label={`${SHORT[a.id]}: ${chosen ? 'chosen' : avail ? 'available' : 'no slots left'}`} onClick={() => toggle(a)}>
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{SHORT[a.id]}</span>
                    <span className="s-muted" style={{ fontSize: 13, lineHeight: 1.35 }}>{capped ? `${capped}.` : a.text}</span>
                  </span>
                  <span className={`adv-boxes ${a.cost === 2 ? 'boxed' : ''}`} aria-hidden="true">
                    {Array.from({ length: Math.max(total, 1) }, (_, i) => {
                      const state = i < usedHere ? 'used' : i < usedHere + chosen * a.cost ? 'on' : '';
                      return <span key={i} className={`s-sq ${state === 'on' ? 'on' : ''} ${state === 'used' ? 'used' : ''}`} style={{ width: 24, height: 24 }} />;
                    })}
                  </span>
                </button>
                {picks.map((p, i) => p.id !== a.id ? null : (
                  <PickDetail key={i} p={p} ch={ch} level={level} expNames={expNames} expVals={expVals}
                    taken={newCardIds} sim={simForCards} onChange={(x) => edit(i, x)} />
                ))}
              </div>
            );
          })}
        </section>

        <section className="stack-6">
          <span className="s-label">Step {ach ? 3 : 2} · Damage thresholds</span>
          <span className="s-feat-text" style={{ fontSize: 15 }}>All thresholds +1: Major {d.thresholds.major} → <b>{d.thresholds.major + 1}</b>, Severe {d.thresholds.severe} → <b>{d.thresholds.severe + 1}</b></span>
        </section>

        <section className="stack-6">
          <span className="s-label">Step {ach ? 4 : 3} · Domain card</span>
          <span className="s-feat-text" style={{ fontSize: 15 }}>A new card of level {level} or lower from {classById.get(ch.classId)!.domains.map(cap).join(' or ')}{ch.multiclass || mcPick ? ' (or your multiclass domain, up to half your level)' : ''}. It goes to your loadout if there’s room, otherwise your vault.</span>
          <CardList ch={simForCards} level={level} value={card} exclude={newCardIds.filter((x) => x !== card)} onPick={setCard} />
        </section>

        {needExtra > 0 && (
          <section className="stack-6">
            <span className="s-label">Upgraded subclass · {needExtra} additional card</span>
            <CardList ch={simForCards} level={level} value={extra[0] ?? ''} exclude={newCardIds.filter((x) => x !== extra[0])} onPick={(x) => setExtra([x])} />
          </section>
        )}

        {newCardIds.includes('blade-vitality') && (
          <section className="stack-6">
            <span className="s-label">Vitality · choose two</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['stress', 'hitPoint', 'thresholds'] as const).map((v) => (
                <button key={v} className={`s-mini ${vitality.includes(v) ? 'solid' : ''}`} disabled={!vitality.includes(v) && vitality.length >= 2}
                  onClick={() => setVitality(vitality.includes(v) ? vitality.filter((x) => x !== v) : [...vitality, v])}>
                  {v === 'stress' ? 'One Stress slot' : v === 'hitPoint' ? 'One Hit Point slot' : '+2 damage thresholds'}
                </button>
              ))}
            </div>
          </section>
        )}
        {newCardIds.includes('grace-master-of-the-craft') && (
          <section className="stack-6">
            <span className="s-label">Master of the Craft · +2 to two Experiences or +3 to one</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {expNames.map((n, i) => (
                <button key={i} className={`s-mini ${master.includes(i) ? 'solid' : ''}`} disabled={!master.includes(i) && master.length >= 2}
                  onClick={() => setMaster(master.includes(i) ? master.filter((x) => x !== i) : [...master, i])}>{n}</button>
              ))}
            </div>
          </section>
        )}

        {trainNeed > 0 && <CompanionTraining ch={ch} need={trainNeed} value={train} onChange={setTrain} />}
        {hasCompanion(ch) && !ch.companion && <p className="s-muted" style={{ fontSize: 14 }}>Create your companion on the Subclass tab to give it training here.</p>}

        {problems.length > 0 && <p className="callout" role="status">{problems[0]}</p>}
        <button className="s-btn solid s-press" style={{ minHeight: 52 }} disabled={problems.length > 0}
          onClick={() => {
            let next = applyLevelUp(ch, choices);
            if (next.companion && train.length) next = { ...next, companion: { ...next.companion, picks: [...companionPicks(next.companion), ...train.slice(0, trainNeed)] } };
            saveCharacter(next);
            setDone(next);
          }}>
          Level up to {level}
        </button>
      </Page>
    </div>
  );
}

function PickDetail({ p, ch, level, expNames, expVals, taken, sim, onChange }: {
  p: Pick; ch: Character; level: number; expNames: string[]; expVals: number[]; taken: string[]; sim: Character; onChange: (p: Partial<Pick>) => void;
}) {
  const d = derive(ch);
  const ach = achievementAt(level);
  const marked = ach?.clearMarkedTraits ? [] : ch.markedTraits;
  const toggleIn = (arr: number[] | TraitId[], v: never) => (arr as never[]).includes(v) ? (arr as never[]).filter((x) => x !== v) : (arr.length < 2 ? [...arr, v] : arr);
  switch (p.id) {
    case 'traits':
      return (
        <div className="pick-detail">
          <span className="s-muted" style={{ fontSize: 13 }}>Choose two unmarked traits ({p.traits.length}/2)</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TRAIT_IDS.map((t) => (
              <button key={t} className={`s-mini ${p.traits.includes(t) ? 'solid' : ''}`} disabled={marked.includes(t)}
                onClick={() => onChange({ traits: toggleIn(p.traits, t as never) as TraitId[] })}>{cap(t)} {signed(d.traits[t])} → {signed(d.traits[t] + 1)}</button>
            ))}
          </div>
        </div>
      );
    case 'experiences':
      return (
        <div className="pick-detail">
          <span className="s-muted" style={{ fontSize: 13 }}>Choose two Experiences ({p.experiences.length}/2)</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {expNames.map((n, i) => (
              <button key={i} className={`s-mini ${p.experiences.includes(i) ? 'solid' : ''}`} style={{ textTransform: 'none', letterSpacing: 0 }}
                onClick={() => onChange({ experiences: toggleIn(p.experiences, i as never) as number[] })}>{n} +{expVals[i]} → +{expVals[i] + 1}</button>
            ))}
          </div>
        </div>
      );
    case 'domainCard':
      return <div className="pick-detail"><CardList ch={sim} level={level} value={p.card} exclude={taken.filter((x) => x !== p.card)} onPick={(c) => onChange({ card: c })} /></div>;
    case 'subclass': {
      const sub = subclassOf(ch);
      const next = STAGES[Math.min(2, STAGES.indexOf(ch.subclassStage) + 1)];
      return (
        <div className="pick-detail">
          <span className="s-label" style={{ fontSize: 13 }}>{sub.name} · {cap(next)}</span>
          {sub[next].map((f) => <div key={f.id}><span className="s-feat-name" style={{ fontSize: 16 }}>{f.name}</span><Rich text={f.text} style={{ fontSize: 14 }} /></div>)}
        </div>
      );
    }
    case 'multiclass': {
      const mc = classes.find((c) => c.id === p.mcClass);
      return (
        <div className="pick-detail">
          <label className="s-label s-muted" style={{ fontSize: 12 }} htmlFor="mc-class">Class</label>
          <select id="mc-class" className="s-field" value={p.mcClass} onChange={(e) => onChange({ mcClass: e.target.value, mcDomain: '', mcSub: '' })}>
            <option value="">Choose a class</option>
            {classes.filter((c) => c.id !== ch.classId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {mc && (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {mc.domains.map((dm) => <button key={dm} className={`s-mini ${p.mcDomain === dm ? 'solid' : ''}`} onClick={() => onChange({ mcDomain: dm })}>{cap(dm)} domain</button>)}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {mc.subclasses.map((s) => <button key={s.id} className={`s-mini ${p.mcSub === s.id ? 'solid' : ''}`} onClick={() => onChange({ mcSub: s.id })}>{s.name}</button>)}
              </div>
              <span className="s-muted" style={{ fontSize: 13 }}>You gain {mc.name}’s class feature and the foundation of the subclass you pick. This crosses out the other multiclass options and this tier’s subclass upgrade.</span>
            </>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}

function CardList({ ch, level, value, exclude, onPick }: { ch: Character; level: number; value: string; exclude: string[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState('');
  const cards = useMemo(() => legalCards(ch, level, exclude), [ch, level, exclude.join()]);
  const levels = [...new Set(cards.map((c) => c.level))].sort((a, b) => a - b);
  const chosenLevel = cards.find((c) => c.id === value)?.level;
  const [tab, setTab] = useState<number>(chosenLevel ?? levels[levels.length - 1] ?? 1);
  const shown = levels.includes(tab) ? tab : levels[levels.length - 1];
  const atLevel = cards.filter((c) => c.level === shown);
  const doms = [...new Set(atLevel.map((c) => c.domain))];
  return (
    <div className="card-list">
      {/* One level at a time: tabs instead of a long list. */}
      <div className="s-pills" role="tablist" aria-label="Card level" style={{ flexWrap: 'wrap' }}>
        {levels.map((lvl) => (
          <button key={lvl} role="tab" aria-selected={shown === lvl} className={`s-pill ${shown === lvl ? 'on' : ''}`} style={{ minWidth: 40 }}
            onClick={() => setTab(lvl)}>{lvl}{chosenLevel === lvl ? ' ✓' : ''}</button>
        ))}
      </div>
      {doms.map((dm, di) => (
        <Fragment key={dm}>
          {di > 0 && <hr className="sep" style={{ width: '60%' }} />}
          <span className="s-label domain-head" style={{ fontSize: 14 }}><DomainIcon domain={dm} size={20} /> {cap(dm)}</span>
          {atLevel.filter((c) => c.domain === dm).map((c) => {
            const sel = value === c.id;
            const isOpen = open === c.id || sel;
            return (
              <div key={c.id} className={`card-pick ${sel ? 'sel' : ''}`}>
                <button className="s-row s-press" aria-expanded={isOpen} onClick={() => setOpen(open === c.id ? '' : c.id)}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
                    <DomainIcon domain={c.domain} />
                    <span style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="s-feat-name" style={{ fontSize: 17 }}>{c.name}</span>
                      <span className="s-muted" style={{ fontSize: 13 }}>{cap(c.domain)} · Level {c.level} {cap(c.type)}</span>
                    </span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{sel && <span className="chosen">Chosen</span>}<Recall cost={c.recallCost} /></span>
                </button>
                {isOpen && (
                  <div className="stack-10" style={{ padding: '0 12px 12px' }}>
                    <Rich text={c.text} style={{ fontSize: 14 }} />
                    <button className={`s-mini ${sel ? '' : 'solid'}`} style={{ alignSelf: 'flex-start' }} onClick={() => onPick(sel ? '' : c.id)}>{sel ? 'Remove' : 'Choose'}</button>
                  </div>
                )}
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

