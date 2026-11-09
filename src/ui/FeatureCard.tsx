import { useState, type ReactNode } from 'react';
import { attackNow, naturalAttack } from '../app/attack';
import {
  actionRoll, armAmount, armedFor, canPay, countDice, damage, dice, dieKey, gainText, pay, refocus, resourceOf, rollHeld, spendHeld,
  toggleArm, toggleHopeDie, togglePoolArm, usePlay, withCost, withGain,
} from '../app/play';
import { updateCharacter } from '../app/store';
import { toast } from '../app/toast';
import { cardById, type TraitId } from '../data';
import {
  ACTIVE, RESOURCES, activeCtx, controlsFor, costLabel, customControls, derive, hasFeature, inEffect, isActive, sectionsOf, setActive,
  type ActiveDef, type Character, type Control, type Cost, type Count, type DamageControl, type DiceControl, type RollControl, type TokenSource,
} from '../rules';
import { Rich } from './kit';

/** A feature or domain card with tap controls derived from its text (see rules/mechanics.ts). */
export function FeatureCard({
  ch, featureKey, name, text, meta, aside, note, ghost, tag, extra, skip = [],
}: {
  ch: Character;
  /** Stable key for uses/tokens, e.g. "class:rally" or "card:arcana-rune-ward". */
  featureKey: string;
  name: string;
  text: string;
  meta?: string;
  aside?: ReactNode;
  note?: string;
  ghost?: boolean;
  tag?: string;
  extra?: ReactNode;
  /** Control kinds handled elsewhere. */
  skip?: Control['kind'][];
}) {
  const sections = sectionsOf(text);
  return (
    <article className={`feat ${ghost ? 's-ghost' : ''}`}>
      <div className="s-row" style={{ alignItems: 'flex-start' }}>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span className="s-feat-name">{name}</span>
          {meta && <span className="s-muted" style={{ fontSize: 13 }}>{meta}</span>}
        </span>
        {tag && <span className="s-label s-muted" style={{ fontSize: 12, textAlign: 'right' }}>{tag}</span>}
        {aside}
      </div>
      {sections.length === 1 ? (
        <>
          <Rich text={text} />
          {/* A counting die explains itself; the book's tip on how it counts isn't needed. */}
          {note && !customControls(ch, featureKey, controlsFor(text)).some((c) => c.kind === 'dieCounter' || c.kind === 'resource') && <span className="s-muted" style={{ fontSize: 14, lineHeight: 1.4 }}>{note}</span>}
          {!ghost && <Controls ch={ch} featureKey={featureKey} name={name} text={text} skip={skip} />}
        </>
      ) : sections.map((s, i) => (
        <div key={i} className="feat-section">
          {s.title && <span className="s-feat-name" style={{ fontSize: 17 }}>{s.title}</span>}
          <Rich text={s.text} />
          {!ghost && <Controls ch={ch} featureKey={s.title ? `${featureKey}:${s.title}` : featureKey} name={s.title ?? name} text={s.text} skip={skip} />}
        </div>
      ))}
      {extra}
    </article>
  );
}

/** Later features that change an earlier one's dice (Fueled by Fear, Epic Poetry). */
function upgraded(ch: Character, featureKey: string, c: Control): Control {
  const has = (id: string) => inEffect(ch).some((e) => e.key === `sub:${id}`);
  if (featureKey === 'sub:face-your-fear' && c.kind === 'arm' && 'damageDice' in c.effect) {
    const count = has('have-no-fear') ? 3 : has('fueled-by-fear') ? 2 : 1;
    return { ...c, effect: { damageDice: { count, sides: 10 } }, label: `+${count}d10 damage` };
  }
  if (featureKey === 'class:rally' && c.kind === 'dice' && has('epic-poetry')) return { ...c, sides: 10, upgrade: undefined, label: 'Roll Rally Die' };
  return c;
}

/** Tap controls for a piece of equipment's feature (Hatchet's Follow-Up, Hammer of Wrath's Devastating). */
export function EquipmentControls({ ch, item, feature }: { ch: Character; item: string; feature: { name: string; text: string } }) {
  // Versatile has its own toggle; a weapon's attack is its Hit button.
  if (/can also be used with these statistics/i.test(feature.text)) return null;
  return <Controls ch={ch} featureKey={`gear:${item}`} name={feature.name} text={feature.text} skip={['attack']} />;
}

function Controls({ ch, featureKey, name, text, skip }: { ch: Character; featureKey: string; name: string; text: string; skip: Control['kind'][] }) {
  const controls = customControls(ch, featureKey, controlsFor(text)).filter((c) => !skip.includes(c.kind)).map((c) => upgraded(ch, featureKey, c));
  const uses = controls.filter((c): c is Extract<Control, { kind: 'uses' }> => c.kind === 'uses');
  const hopeDie = controls.find((c): c is Extract<Control, { kind: 'hopeDie' }> => c.kind === 'hopeDie');
  const tokens = controls.find((c): c is Extract<Control, { kind: 'tokens' }> => c.kind === 'tokens');
  // A lasting effect: its own cost, or the text's first cost, switches it on.
  const activeDef = ACTIVE[featureKey.replace(/^mcsub:/, 'sub:')];
  const activator = activeDef && !activeDef.cost && !activeDef.start ? controls.find((c) => c.kind === 'hope' || c.kind === 'stress' || c.kind === 'pay') : undefined;
  const counter = controls.find((c): c is Extract<Control, { kind: 'dieCounter' }> => c.kind === 'dieCounter');
  const pool = controls.find((c): c is Extract<Control, { kind: 'dicePool' }> => c.kind === 'dicePool');
  const panels: Control['kind'][] = ['uses', 'tokens', 'dieCounter', 'dicePool', 'resource', 'heldDice', 'rallyDie', 'phaseDie', 'pickNumber', 'pickDie', 'channelRaw'];
  const actions = controls.filter((c) => !panels.includes(c.kind) && c !== activator && !(c.kind === 'hopeDie' && uses.length));
  const tokenKey = `tokens:${featureKey}`;
  const activeKey = featureKey.replace(/^mcsub:/, 'sub:');
  return (
    <>
      {activeDef && <ActiveToggle ch={ch} k={activeKey} def={activeDef} cost={activeDef.cost ?? (activator ? costOf(activator) : undefined)}
        use={activeDef.once ? `${activeDef.once}:${featureKey}` : activator && 'once' in activator && activator.once ? `${activator.once}:${featureKey}` : undefined} />}
      {uses.map((u, i) => <UseBoxes key={u.label} ch={ch} k={`${u.scope}:${featureKey}`} max={u.max} label={u.label} arm={i === 0 && hopeDie ? { sides: hopeDie.sides, source: name } : undefined} />)}
      {tokens && <Tokens ch={ch} k={tokenKey} source={tokens.source} label={tokens.label} max={featureKey === 'tf:feed' ? 6 : undefined} />}
      {pool && <DicePool ch={ch} c={pool} poolKey={`pool:${featureKey}`} />}
      {counter && <DieCounter ch={ch} c={counter} name={name} featureKey={featureKey}
        use={uses[0] && !activator ? { key: `${uses[0].scope}:${featureKey}`, max: uses[0].max } : undefined} />}
      {controls.map((c, i) => {
        switch (c.kind) {
          case 'resource': return <ResourceCounter key={i} ch={ch} c={c} featureKey={featureKey} />;
          case 'heldDice': return <PrayerDice key={i} ch={ch} />;
          case 'rallyDie': return <RallyDie key={i} ch={ch} c={c} featureKey={featureKey} />;
          case 'phaseDie': return <PhaseDie key={i} ch={ch} featureKey={featureKey} />;
          case 'pickNumber': return <PickNumber key={i} ch={ch} c={c} />;
          case 'pickDie': return <PickDie key={i} ch={ch} c={c} />;
          case 'channelRaw': return <ChannelRaw key={i} ch={ch} featureKey={featureKey} />;
          default: return null;
        }
      })}
      {actions.length > 0 && (
        <span className="ctl-row">
          {actions.map((c, i) => <ControlButton key={`${c.kind}-${i}`} ch={ch} c={c} name={name} featureKey={featureKey} tokenKey={tokenKey}
            use={'useKey' in c && c.useKey ? { key: c.useKey, max: ('max' in c && c.max) || 1 }
              : 'once' in c && c.once ? { key: `${c.once}:${featureKey}`, max: uses.find((u) => u.scope === c.once)?.max ?? ('max' in c && c.max ? c.max : 1) } : undefined} />)}
        </span>
      )}
    </>
  );
}

function costOf(c: Control): Cost | undefined {
  if (c.kind === 'hope') return { hope: c.n };
  if (c.kind === 'stress') return { stress: c.n };
  if (c.kind === 'pay' || c.kind === 'spend') return c.cost;
  return undefined;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Resolve a dice count that depends on your stats. */
function countFor(ch: Character, n: Count): number {
  const d = derive(ch);
  if (typeof n === 'number') return n;
  if (n === 'proficiency') return d.proficiency;
  if (n === 'spellcast') return Math.max(0, d.spellcast ?? 0);
  return Math.max(0, d.traits[n]);
}

function rollNow(ch: Character, c: RollControl, name: string) {
  const d = derive(ch);
  const spell = c.trait === 'spellcast';
  const trait: TraitId | undefined = spell ? d.spellcastTraits.slice().sort((a, b) => d.traits[b] - d.traits[a])[0] : (c.trait as TraitId);
  if (!trait) { toast('You have no Spellcast trait.'); return; }
  const mods = [{ label: cap(trait), value: d.traits[trait] }, ...(spell && d.spellcastBonus ? [{ label: 'Spellcast bonus', value: d.spellcastBonus }] : [])];
  actionRoll(ch.id, spell ? `Spellcast · ${cap(trait)}` : `${cap(trait)} Roll`, mods, c.difficulty ? `${name} · Difficulty ${c.difficulty}` : name, { trait, reaction: c.reaction });
}

function rollLabel(ch: Character, c: RollControl): string {
  if (c.trait !== 'spellcast') return `${c.reaction ? 'Reaction · ' : ''}${c.label}`;
  const d = derive(ch);
  const t = d.spellcastTraits.slice().sort((a, b) => d.traits[b] - d.traits[a])[0];
  return `${c.reaction ? 'Reaction · ' : ''}Spellcast · ${t ? cap(t) : 'none'}${c.difficulty ? ` (${c.difficulty})` : ''}`;
}

function diceNow(ch: Character, c: DiceControl | DamageControl, name: string, sub?: string) {
  const count = countFor(ch, c.count);
  const sides = c.kind === 'dice' && c.upgrade && ch.level >= c.upgrade.level ? c.upgrade.sides : c.sides;
  if (count < 1) { toast('That rolls no dice right now.'); return; }
  const text = `${count}d${sides}${c.bonus ? `+${c.bonus}` : ''}`;
  if (c.kind === 'damage') damage(name, { dice: [{ count, sides }], bonus: c.bonus }, `${text}${c.type ? ` ${c.type}` : ''}${sub ? ` · ${sub}` : ''}`, [], { charId: ch.id, magic: c.type === 'magic', attack: true });
  else dice(name, count, sides, c.bonus, sub);
}

function diceLabel(ch: Character, c: DiceControl | DamageControl): string {
  const count = countFor(ch, c.count);
  const sides = c.kind === 'dice' && c.upgrade && ch.level >= c.upgrade.level ? c.upgrade.sides : c.sides;
  const dice = `${count}d${sides}${c.bonus ? `+${c.bonus}` : ''}`;
  if (c.kind === 'damage') {
    const named = c.label.includes(' · ') ? `${c.label.split(' · ')[0]} · ` : '';
    return `${named}Damage ${dice}`;
  }
  return c.upgrade || /Die$/.test(c.label) ? `${c.label} · d${sides}` : `Roll ${dice}`;
}

/** A use box ticked when the control is used ("Once per rest, spend 3 Hope …"). */
interface UseLink { key: string; max: number }

function ControlButton({ ch, c, name, featureKey, tokenKey, use }: { ch: Character; c: Control; name: string; featureKey: string; tokenKey: string; use?: UseLink }) {
  const spent = !!use && (ch.uses[use.key] ?? 0) >= use.max;
  const done = use ? () => updateCharacter(ch.id, (x) => ({ ...x, uses: { ...x.uses, [use.key]: (x.uses[use.key] ?? 0) + 1 } })) : undefined;
  switch (c.kind) {
    case 'hope':
    case 'stress':
      return <CostButton ch={ch} cost={costOf(c)!} label={c.label} spent={spent} done={done} />;
    case 'roll':
      return <button className="s-mini solid" onClick={() => rollNow(ch, c, name)}>{rollLabel(ch, c)}</button>;
    case 'attack':
      return <button className="s-mini solid" onClick={() => { if (!attackNow(ch.id, c.primary)) toast('Equip a weapon to attack.'); }}>{c.primary ? 'Attack · primary weapon' : 'Attack'}</button>;
    case 'dice':
    case 'damage':
      return <button className="s-mini" onClick={() => diceNow(ch, c, name)}>{diceLabel(ch, c)}</button>;
    case 'pay':
      return <PayButton ch={ch} c={c} name={name} spent={spent} done={done} />;
    case 'arm':
      return <ArmButton ch={ch} c={c} k={`${featureKey}:${c.label}`} spent={spent} done={done} tokenKey={tokenKey} />;
    case 'scaled':
      return <Scaled ch={ch} c={c} name={name} featureKey={featureKey} tokenKey={tokenKey} spent={spent} done={done} />;
    case 'choice':
      return <Choice ch={ch} c={c} k={`${featureKey}:choice`} name={name} />;
    case 'hopeDie':
      return <HopeDieToggle ch={ch} sides={c.sides} name={name} />;
    case 'spend':
      return <CostButton ch={ch} cost={c.cost} label={c.label} spent={spent}
        done={() => { done?.(); if (c.gain) updateCharacter(ch.id, (x) => withGain(x, c.gain!)); toast(`${name}: ${c.label.split(' · ')[0]}.`); }} />;
    case 'gain':
      return <GainButton ch={ch} c={c} name={name} spent={spent} done={done} />;
    case 'natural':
      return <button className="s-mini solid" disabled={!canPay(ch, c.cost)} onClick={() => naturalAttack(ch.id, c)}>{`Attack · ${c.label}`}</button>;
    default:
      return null;
  }
}

/** Spend Hope or mark Stress; asks first for 2 or more Hope. */
function CostButton({ ch, cost, label, spent, done }: { ch: Character; cost: Cost; label: string; spent?: boolean; done?: () => void }) {
  const [asking, setAsking] = useState(false);
  const ok = canPay(ch, cost) && !spent;
  const go = () => { if (pay(ch.id, cost)) done?.(); };
  if (asking) {
    return (
      <span className="s-row confirm">
        <span style={{ fontSize: 14 }}>{label}?</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button className="s-mini" onClick={() => setAsking(false)}>Cancel</button>
          <button className="s-mini solid" onClick={() => { go(); setAsking(false); }}>Apply</button>
        </span>
      </span>
    );
  }
  return (
    <button className={`s-mini ${'hope' in cost ? 'solid' : ''}`} disabled={!ok}
      onClick={() => ('hope' in cost && cost.hope >= 2 ? setAsking(true) : go())}>{spent ? `${label} · used` : label}</button>
  );
}

/** Pay the cost and roll what it pays for, in one tap. */
function PayButton({ ch, c, name, spent, done }: { ch: Character; c: Extract<Control, { kind: 'pay' }>; name: string; spent?: boolean; done?: () => void }) {
  const [asking, setAsking] = useState(false);
  const t = c.then;
  const what = t.kind === 'roll' ? rollLabel(ch, t) : t.kind === 'attack' ? 'Attack' : diceLabel(ch, t).replace(/^Roll /, '');
  const label = `${costLabel(c.cost)} · ${what}`;
  const go = () => {
    setAsking(false);
    if (!pay(ch.id, c.cost)) return;
    done?.();
    if (t.kind === 'roll') rollNow(withCost(ch, c.cost), t, name);
    else if (t.kind === 'attack') { if (!attackNow(ch.id, t.primary)) toast('Equip a weapon to attack.'); }
    else diceNow(ch, t, name, `${costLabel(c.cost)} spent`);
  };
  if (asking) {
    return (
      <span className="s-row confirm">
        <span style={{ fontSize: 14 }}>{label}?</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button className="s-mini" onClick={() => setAsking(false)}>Cancel</button>
          <button className="s-mini solid" onClick={go}>Go</button>
        </span>
      </span>
    );
  }
  return (
    <button className="s-mini solid" disabled={!canPay(ch, c.cost) || spent} onClick={() => ('hope' in c.cost && c.cost.hope >= 2 ? setAsking(true) : go())}>{spent ? `${label} · used` : label}</button>
  );
}

/** Armed for the next roll or damage roll; tap again to disarm (and refund). */
function ArmButton({ ch, c, k, spent, done, tokenKey }: { ch: Character; c: Extract<Control, { kind: 'arm' }>; k: string; spent?: boolean; done?: () => void; tokenKey: string }) {
  const armed = usePlay((s) => s.armed[ch.id]) ?? armedFor(ch.id);
  const have = armed.arms.find((x) => x.key === k);
  const more = have && c.max && have.count < c.max;
  // Options bought with a card token (Strategic Approach): one token each.
  const noTokens = !!c.tokenCost && (ch.uses[tokenKey] ?? 0) < c.tokenCost;
  return (
    <button className={`s-mini ${have ? 'solid' : ''}`} aria-pressed={!!have} disabled={!have && (!canPay(ch, c.cost) || spent || noTokens)}
      onClick={() => {
        toggleArm(ch.id, { key: k, label: c.label, effect: c.effect, cost: c.cost, max: c.max, persist: c.persist,
          tokens: c.tokenCost ? { key: tokenKey, n: c.tokenCost } : undefined });
        if (!have) done?.();
        else if (c.once) updateCharacter(ch.id, (x) => ({ ...x, uses: { ...x.uses, [`${c.once}:${k.split(':').slice(0, -1).join(':')}`]: 0 } }));
      }}>
      {have ? `${c.label.split(' · ')[0]}${have.count > 1 ? ` ×${have.count}` : ''} · ${more ? 'tap to add' : c.persist ? 'on' : 'armed'}` : `${c.label}${c.tokenCost ? ' · 1 token' : ''}`}
    </button>
  );
}

/** "Spend any number of …": choose an amount, then pay and roll. */
function Scaled({ ch, c, name, featureKey, tokenKey, spent, done }: { ch: Character; c: Extract<Control, { kind: 'scaled' }>; name: string; featureKey: string; tokenKey: string; spent?: boolean; done?: () => void }) {
  const d = derive(ch);
  const tokens = ch.uses[tokenKey] ?? 0;
  const res = c.unit === 'favor' || c.unit === 'focus' ? c.unit : null;
  const cap = c.unit === 'hope' ? ch.hope : c.unit === 'stress' ? d.stressSlots - ch.stress : c.unit === 'tokens' ? tokens : res ? resourceOf(ch, res) : 20;
  const max = Math.min(cap, c.max ?? 99);
  const [n, setN] = useState(c.min);
  const amount = Math.min(Math.max(n, c.min), Math.max(max, c.min));
  const unitText = c.unit === 'hope' ? 'Hope' : c.unit === 'stress' ? 'Stress' : c.unit === 'tokens' ? (amount === 1 ? 'token' : 'tokens') : res ? RESOURCES[res].name : '';
  const go = () => {
    if (max < amount) return;
    if (c.unit === 'hope' && !pay(ch.id, { hope: amount })) return;
    if (c.unit === 'stress' && !pay(ch.id, { stress: amount })) return;
    if (res && !pay(ch.id, { res, n: amount })) return;
    if (c.unit === 'tokens') updateCharacter(ch.id, (x) => ({ ...x, uses: { ...x.uses, [tokenKey]: Math.max(0, (x.uses[tokenKey] ?? 0) - amount) } }));
    done?.();
    const spent = c.unit === 'count' ? '' : `${amount} ${unitText} spent`;
    if (c.toTokens) { updateCharacter(ch.id, (x) => ({ ...x, uses: { ...x.uses, [tokenKey]: (x.uses[tokenKey] ?? 0) + amount } })); toast(`${name}: ${amount} token${amount > 1 ? 's' : ''} on the card.`); }
    else if (c.atLeast && c.per) countDice(ch.id, name, amount, c.per.sides, c.atLeast, !!c.clearHp, c.note);
    else if (c.per?.toDamageRoll) armAmount(ch.id, `${featureKey}:scaled`, `+${amount}d${c.per.sides} damage (${name})`, { damage: { dice: { count: amount, sides: c.per.sides } } });
    else if (c.flat && c.toRoll) armAmount(ch.id, `${featureKey}:scaled`, `+${amount * c.flat} to the roll (${name})`, { roll: { value: amount * c.flat } });
    else if (c.flat) armAmount(ch.id, `${featureKey}:scaled`, `+${amount * c.flat} damage (${name})`, { damage: { bonus: amount * c.flat } });
    else if (c.per?.damage) damage(name, { dice: [{ count: amount, sides: c.per.sides }], bonus: c.per.bonus * amount }, `${amount}d${c.per.sides}${c.per.bonus ? `+${c.per.bonus * amount}` : ''}${c.per.type ? ` ${c.per.type}` : ''} · ${spent}`, [], { charId: ch.id, magic: c.per.type === 'magic', attack: true });
    else if (c.per) dice(name, amount, c.per.sides, 0, spent, c.highest && c.note ? [`Highest result: ${c.note}.`] : []);
    else toast(`${name}: ${spent}${c.note ? `, ${c.note}` : ''}.`);
    setN(c.min);
  };
  const result = c.toTokens ? `${amount} token${amount > 1 ? 's' : ''}` : c.per?.toDamageRoll ? `+${amount}d${c.per.sides} to damage` : c.flat ? `+${amount * c.flat}${c.toRoll ? ' to the roll' : ' damage'}` : c.per ? `${amount}d${c.per.sides}${c.per.bonus ? `+${c.per.bonus * amount}` : ''}` : '';
  return (
    <span className="stepper" role="group" aria-label={c.label}>
      <button className="s-mini" aria-label="Fewer" disabled={amount <= c.min} onClick={() => setN(amount - 1)}>−</button>
      <span className="s-num" style={{ fontSize: 18, minWidth: 22, textAlign: 'center' }}>{amount}</span>
      <button className="s-mini" aria-label="More" disabled={amount >= max} onClick={() => setN(amount + 1)}>+</button>
      <button className="s-mini solid" disabled={max < amount || spent} onClick={go}>
        {spent ? 'Used' : c.unit === 'count' ? `Roll ${amount}d${c.per?.sides}` : `${c.unit === 'stress' ? 'Mark' : 'Spend'} ${amount} ${unitText}${result ? ` · ${result}` : ''}`}
      </button>
    </span>
  );
}

/** Choose one bonus for the next roll (Teleport). */
function Choice({ ch, c, k, name }: { ch: Character; c: Extract<Control, { kind: 'choice' }>; k: string; name: string }) {
  const armed = usePlay((s) => s.armed[ch.id]) ?? armedFor(ch.id);
  const on = armed.arms.find((x) => x.key === k);
  return (
    <span className="ctl-row">
      {c.options.map((o) => {
        const label = `${o.label} · ${o.value >= 0 ? '+' : '−'}${Math.abs(o.value)}`;
        const sel = on?.label === `${name}: ${label}`;
        return (
          <button key={o.label} className={`s-mini ${sel ? 'solid' : ''}`} aria-pressed={sel} style={{ textTransform: 'none', letterSpacing: 0 }}
            onClick={() => armAmount(ch.id, k, `${name}: ${label}`, { roll: { value: o.value } })}>{label}</button>
        );
      })}
    </span>
  );
}

/** Pooled dice (Slayer Dice): how many you hold, and Arm to roll them into your next attack or damage roll. */
function DicePool({ ch, c, poolKey }: { ch: Character; c: Extract<Control, { kind: 'dicePool' }>; poolKey: string }) {
  const armed = usePlay((s) => s.armed[ch.id]) ?? armedFor(ch.id);
  const arm = armed.arms.find((x) => x.key === `pool:${poolKey}`);
  const max = derive(ch).proficiency;
  const have = ch.uses[poolKey] ?? 0;
  const shown = arm ? arm.refundTo?.n ?? 0 : have;
  return (
    <div className="die-counter">
      <div className={`s-die sm d${c.sides}`} role="img" aria-label={`${shown} ${c.name}`}><span>{shown}</span></div>
      <span style={{ flex: 1, fontSize: 14, lineHeight: 1.35 }}>
        <b>{c.name} {shown}/{max}</b>
        <br /><span className="s-muted">{arm ? `Armed: ${shown}d${c.sides} on your next attack or damage roll.` : have ? 'Gain more on a roll with Hope.' : 'On a roll with Hope, take one instead of the Hope.'}</span>
      </span>
      <button className={`s-mini ${arm ? 'solid' : ''}`} aria-pressed={!!arm} disabled={!arm && !have}
        onClick={() => togglePoolArm(ch.id, poolKey, c.name, c.sides)}>{arm ? 'Armed' : 'Arm'}</button>
    </div>
  );
}

/**
 * A die kept on the sheet that counts up (Unstoppable): start it at 1, tap + to
 * count up; past its highest face it ends. Starting it uses the feature's
 * "once per long rest", which stays used until that rest.
 */
function DieCounter({ ch, c, name, featureKey, use }: {
  ch: Character; c: Extract<Control, { kind: 'dieCounter' }>; name: string; featureKey: string; use?: { key: string; max: number };
}) {
  const sides = c.upgrade && ch.level >= c.upgrade.level ? c.upgrade.sides : c.sides;
  const k = dieKey(c.addsTo, sides, featureKey);
  const value = ch.uses[k] ?? 0;
  const spent = !!use && (ch.uses[use.key] ?? 0) >= use.max;
  const setValue = (v: number, extra: Record<string, number> = {}) =>
    updateCharacter(ch.id, (x) => ({ ...x, uses: { ...x.uses, ...extra, [k]: v } }));
  const title = c.label === 'Die' ? name : c.label.replace(/ Die$/, '');
  if (!value) {
    return (
      <button className="s-mini solid" style={{ alignSelf: 'flex-start' }} disabled={spent}
        onClick={() => setValue(1, use ? { [use.key]: (ch.uses[use.key] ?? 0) + 1 } : {})}>
        {spent ? `${title} · used until your rest` : `Start ${title} · d${sides}`}
      </button>
    );
  }
  return (
    <div className="die-counter">
      <div className={`s-die sm d${sides}`} role="img" aria-label={`${title} die showing ${value} of ${sides}`}><span>{value}</span></div>
      <span style={{ flex: 1, fontSize: 14, lineHeight: 1.35 }}>
        <b>{title}: {value}</b>{c.addsTo === 'damage' ? ` · +${value} to your damage rolls` : c.addsTo === 'action' ? ` · +${value} to your action rolls` : ''}
        <br /><span className="s-muted">{value >= sides ? 'At its highest: + ends it.' : `Counts up to ${sides}.`}</span>
      </span>
      <button className="s-mini solid" aria-label={value >= sides ? `End ${title}` : `Count ${title} up to ${value + 1}`}
        onClick={() => { setValue(value >= sides ? 0 : value + 1); if (value >= sides) toast(`${title} ends.`); }}>+</button>
      <button className="s-mini" onClick={() => setValue(0)}>End</button>
    </div>
  );
}

/** "Roll a d20 as your Hope Die" with no use limit (Rise to the Challenge): arm it for the next action roll. */
function HopeDieToggle({ ch, sides, name }: { ch: Character; sides: number; name: string }) {
  const armed = usePlay((s) => s.armed[ch.id]) ?? armedFor(ch.id);
  const on = armed.hopeDie?.source === name;
  return (
    <button className={`s-mini ${on ? 'solid' : ''}`} aria-pressed={on} onClick={() => toggleHopeDie(ch.id, sides, '', name)}>
      {on ? `d${sides} Hope Die armed` : `Arm d${sides} Hope Die`}
    </button>
  );
}

/** A lasting effect: pay to switch it on (choosing first if it asks); it changes your stats until it ends. */
function ActiveToggle({ ch, k, def, cost, use }: { ch: Character; k: string; def: ActiveDef; cost?: Cost; use?: string }) {
  const on = isActive(ch, k);
  const spent = !!use && (ch.uses[use] ?? 0) >= 1;
  const [sel, setSel] = useState<string[]>([]);
  const pick = def.pick ?? 1;
  // Flow State: mark a Stress instead of spending a Focus to shift stances.
  const alt: Cost | undefined = def.group === 'stance' && hasFeature(ch, 'flow-state') ? { stress: 1 } : undefined;
  const start = (opts: string[], c?: Cost) => {
    if (!pay(ch.id, c)) return;
    updateCharacter(ch.id, (x) => {
      let n = setActive(x, k, true, opts);
      if (use) n = { ...n, uses: { ...n.uses, [use]: (n.uses[use] ?? 0) + 1 } };
      const t = def.tokens?.(activeCtx(n, k));
      if (t) n = { ...n, uses: { ...n.uses, [`tokens:${k}`]: t } };
      return n;
    });
    setSel([]);
  };
  if (on) {
    const note = typeof def.note === 'function' ? def.note(activeCtx(ch, k, derive(ch).traits)) : def.note;
    return (
      <div className="beast-on">
        <span style={{ flex: 1, fontSize: 14 }}><b>{def.group === 'stance' ? 'Your stance.' : 'Active.'}</b> {note}</span>
        <button className="s-mini" onClick={() => updateCharacter(ch.id, (c) => setActive(c, k, false))}>End</button>
      </div>
    );
  }
  const verb = def.start ?? (def.group === 'stance' ? 'Shift in' : 'Activate');
  const costs = [cost, alt].filter((c, i) => i === 0 || c) as (Cost | undefined)[];
  const go = (c?: Cost) => {
    if (def.options && sel.length < Math.min(pick, def.options.length)) { toast(pick > 1 ? `Choose ${pick} first.` : 'Choose one first.'); return; }
    start(sel, c);
  };
  return (
    <>
      {def.options && (
        <span className="ctl-row" role="group" aria-label={pick > 1 ? `Choose ${pick}` : 'Choose one'}>
          {def.options.map((o) => {
            const chosen = sel.includes(o.id);
            const clash = !chosen && !!o.set && def.options!.some((x) => x.set === o.set && sel.includes(x.id));
            return (
              <button key={o.id} className={`s-mini ${chosen ? 'solid' : ''}`} aria-pressed={chosen} disabled={spent || clash || (!chosen && sel.length >= pick && pick > 1)}
                onClick={() => setSel(chosen ? sel.filter((x) => x !== o.id) : pick === 1 ? [o.id] : [...sel, o.id])}>{o.label}</button>
            );
          })}
        </span>
      )}
      <span className="ctl-row">
        {costs.map((c, i) => (
          <button key={i} className="s-mini solid" disabled={!canPay(ch, c) || spent} onClick={() => go(c)}>
            {spent ? `${verb} · used` : `${verb}${c ? ` · ${costLabel(c)}` : ''}`}
          </button>
        ))}
      </span>
    </>
  );
}

/** One tap that gives you something ("+2 Hope, clear 2 Stress"); uses its box. */
function GainButton({ ch, c, name, spent, done }: { ch: Character; c: Extract<Control, { kind: 'gain' }>; name: string; spent?: boolean; done?: () => void }) {
  return (
    <button className="s-mini solid" disabled={spent || !canPay(ch, c.cost)} onClick={() => {
      if (!pay(ch.id, c.cost)) return;
      done?.();
      updateCharacter(ch.id, (x) => withGain(x, c.gain));
      const got = gainText(c.gain);
      toast(`${c.label.split(' · ')[0]}: ${[got, c.note].filter(Boolean).join(' ') || name}`);
    }}>{spent ? `${c.label.split(' · ')[0]} · used` : c.label}</button>
  );
}

/** Focus or Favor: a counter with − and +, and Refocus or Tribute. */
function ResourceCounter({ ch, c, featureKey }: { ch: Character; c: Extract<Control, { kind: 'resource' }>; featureKey: string }) {
  const v = resourceOf(ch, c.res);
  const max = RESOURCES[c.res].max;
  const set = (n: number) => updateCharacter(ch.id, (x) => ({ ...x, uses: { ...x.uses, [`res:${c.res}`]: Math.max(0, Math.min(max, n)) } }));
  const refKey = `rest:refocus:${featureKey}`;
  const refUsed = (ch.uses[refKey] ?? 0) >= 1;
  const sp = Math.max(0, derive(ch).spellcast ?? 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span className="s-label" style={{ fontSize: 13, minWidth: 48 }}>{c.label}</span>
        {Array.from({ length: max }, (_, i) => (
          <button key={i} className={`s-token ${i < v ? 'on' : 'spent'}`} style={{ width: 30, height: 30, minWidth: 30, minHeight: 30 }}
            aria-label={`${c.label} ${i + 1} of ${max}${i < v ? '' : ' (empty)'}`} onClick={() => set(i < v ? i : i + 1)} />
        ))}
        <span className="s-num" style={{ fontSize: 18, marginLeft: 'auto' }}>{v}/{max}</span>
      </span>
      {(c.refocus || c.tribute) && (
        <span className="ctl-row">
          {c.refocus && <button className="s-mini solid" disabled={refUsed} onClick={() => refocus(ch.id, refKey)}>{refUsed ? 'Refocus · used this rest' : `Refocus · ${Math.max(1, derive(ch).traits.instinct)}d6, keep highest`}</button>}
          {c.tribute && <button className="s-mini" disabled={!sp || v >= max} onClick={() => { set(v + sp); toast(`Tribute: +${Math.min(sp, max - v)} Favor.`); }}>Tribute (downtime) · +{sp} Favor</button>}
        </span>
      )}
    </div>
  );
}

/** Prayer Dice: rolled at the start of each session, kept with their values. Tap one for Hope; spend them on the result card. */
function PrayerDice({ ch }: { ch: Character }) {
  const held = ch.heldDice?.prayer ?? [];
  const d = derive(ch);
  const count = Math.max(0, d.spellcast ?? 0);
  const devout = hasFeature(ch, 'devout');
  const [sel, setSel] = useState<number | null>(null);
  return (
    <div className="stack-8" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {held.map((v, i) => (
          <button key={i} className={`s-die sm d4 ${sel === i ? 'picked' : ''}`} style={{ border: 0, padding: 0 }} aria-pressed={sel === i}
            aria-label={`Prayer Die showing ${v}`} onClick={() => setSel(sel === i ? null : i)}><span>{v}</span></button>
        ))}
        {!held.length && <span className="s-muted" style={{ fontSize: 14 }}>No Prayer Dice. They roll on their own at a new session.</span>}
      </span>
      <span className="ctl-row">
        {sel !== null && held[sel] !== undefined ? (
          <>
            <button className="s-mini solid" onClick={() => { const v = spendHeld(ch.id, 'prayer', sel); updateCharacter(ch.id, (x) => withGain(x, { hope: v })); setSel(null); toast(`Prayer Die: +${v} Hope.`); }}>Gain {held[sel]} Hope</button>
            <button className="s-mini" onClick={() => { const v = spendHeld(ch.id, 'prayer', sel); setSel(null); toast(`Prayer Die spent: ${v} (reduce damage or aid an ally).`); }}>Spend · {held[sel]}</button>
          </>
        ) : (
          <button className="s-mini" disabled={!count} onClick={() => { const r = rollHeld(ch.id, 'prayer', count, 4, devout); toast(`Prayer Dice: ${r.kept.join(', ')}${devout ? ` (rolled ${r.values.join(', ')}, lowest dropped)` : ''}.`); }}>
            {held.length ? 'Reroll' : 'Roll'} {count}d4{devout ? ' (+1, drop lowest)' : ''}
          </button>
        )}
      </span>
    </div>
  );
}

/** Your Rally Die: once per session you rally (everyone gets one); spend yours on a roll or to clear Stress. */
function RallyDie({ ch, c, featureKey }: { ch: Character; c: Extract<Control, { kind: 'rallyDie' }>; featureKey: string }) {
  const useKey = `session:${featureKey}`;
  const used = (ch.uses[useKey] ?? 0) >= 1;
  const poolKey = `pool:${featureKey}`;
  const have = (ch.uses[poolKey] ?? 0) > 0;
  const armed = usePlay((s) => s.armed[ch.id]) ?? armedFor(ch.id);
  const arm = armed.arms.find((x) => x.key === `pool:${poolKey}`);
  if (!have && !arm) {
    return (
      <button className="s-mini solid" style={{ alignSelf: 'flex-start' }} disabled={used}
        onClick={() => { updateCharacter(ch.id, (x) => ({ ...x, uses: { ...x.uses, [useKey]: 1, [poolKey]: 1 } })); toast(`Rally: you and each ally gain a d${c.sides} Rally Die.`); }}>
        {used ? 'Rally · used this session' : `Rally · everyone gets a d${c.sides}`}
      </button>
    );
  }
  return (
    <span className="ctl-row">
      <button className={`s-mini ${arm ? 'solid' : ''}`} aria-pressed={!!arm} onClick={() => togglePoolArm(ch.id, poolKey, 'Rally Die', c.sides, true)}>
        {arm ? `d${c.sides} Rally Die armed` : `Arm your d${c.sides} Rally Die`}
      </button>
      {!arm && <button className="s-mini" onClick={() => {
        const v = dice('Rally Die', 1, c.sides, 0, 'Clear Stress');
        updateCharacter(ch.id, (x) => withGain({ ...x, uses: { ...x.uses, [poolKey]: 0 } }, { stress: v }));
      }}>Clear Stress · d{c.sides}</button>}
    </span>
  );
}

const PHASES = ['', 'New Moon: spend a Hope to negate Minor damage.', 'Waxing: +2 to damage rolls.', 'Waxing: +2 to damage rolls.', 'Full Moon: +3 to damage thresholds.', 'Waning: +1 Evasion.', 'Waning: +1 Evasion.'];

/** Lunar Phases: a d6 rolled at the start of each session; once per rest, a Hope turns it up by one. */
function PhaseDie({ ch, featureKey }: { ch: Character; featureKey: string }) {
  const k = `session:phase:${featureKey}`;
  const v = ch.uses[k] ?? 0;
  const restKey = `rest:${featureKey}`;
  const stepped = (ch.uses[restKey] ?? 0) >= 1;
  return (
    <div className="die-counter">
      <div className="s-die sm d6" role="img" aria-label={v ? `Lunar die showing ${v}` : 'Lunar die not rolled'}><span>{v || '–'}</span></div>
      <span style={{ flex: 1, fontSize: 14, lineHeight: 1.35 }}>{v ? PHASES[v] : 'Rolls on its own at a new session.'}</span>
      {!v && <button className="s-mini solid" onClick={() => { const r = dice('Lunar Phases', 1, 6); updateCharacter(ch.id, (x) => ({ ...x, uses: { ...x.uses, [k]: r } })); }}>Roll d6</button>}
      {!!v && <button className="s-mini" disabled={stepped || ch.hope < 1}
        onClick={() => { if (pay(ch.id, { hope: 1 })) updateCharacter(ch.id, (x) => ({ ...x, uses: { ...x.uses, [k]: v >= 6 ? 1 : v + 1, [restKey]: 1 } })); }}>
        {stepped ? 'Turned this rest' : '+1 · 1 Hope'}</button>}
    </div>
  );
}

/** Strange Patterns: your number (change it on a long rest). */
function PickNumber({ ch, c }: { ch: Character; c: Extract<Control, { kind: 'pickNumber' }> }) {
  const v = ch.picks[c.field];
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
      <span className="s-label" style={{ fontSize: 12 }}>{c.label}</span>
      <select className="s-field" style={{ width: 'auto', minHeight: 40 }} value={v ?? ''}
        onChange={(e) => updateCharacter(ch.id, (x) => ({ ...x, picks: { ...x.picks, [c.field]: Number(e.target.value) || undefined } }))}>
        <option value="">Choose</option>
        {Array.from({ length: c.max - c.min + 1 }, (_, i) => c.min + i).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      {v ? <span className="s-muted" style={{ fontSize: 13 }}>Rolling a {v} offers a Hope or a cleared Stress.</span> : null}
    </label>
  );
}

/** Combo Die size (raised by level advancements, once per tier). */
function PickDie({ ch, c }: { ch: Character; c: Extract<Control, { kind: 'pickDie' }> }) {
  const v = ch.picks[c.field] ?? c.options[0];
  const allowed = c.options.slice(0, derive(ch).tier);
  return (
    <span className="ctl-row" role="group" aria-label={c.label}>
      <span className="s-label" style={{ fontSize: 12, alignSelf: 'center' }}>{c.label}</span>
      {allowed.map((n) => (
        <button key={n} className={`s-mini ${v === n ? 'solid' : ''}`} aria-pressed={v === n}
          onClick={() => updateCharacter(ch.id, (x) => ({ ...x, picks: { ...x.picks, [c.field]: n } }))}>d{n}</button>
      ))}
    </span>
  );
}

/** Channel Raw Power: put a loadout card in your vault for Hope equal to its level, or twice its level on a spell's damage. */
function ChannelRaw({ ch, featureKey }: { ch: Character; featureKey: string }) {
  const useKey = `longRest:${featureKey}`;
  const used = (ch.uses[useKey] ?? 0) >= 1;
  const [card, setCard] = useState('');
  const c = cardById.get(card);
  const vault = (fn: (x: Character) => Character) => updateCharacter(ch.id, (x) => fn({
    ...x, cards: { loadout: x.cards.loadout.filter((id) => id !== card), vault: [...x.cards.vault, card] }, uses: { ...x.uses, [useKey]: 1 },
  }));
  if (used) return <span className="s-muted" style={{ fontSize: 13 }}>Used until your long rest.</span>;
  return (
    <span className="ctl-row">
      <select className="s-field" style={{ width: 'auto', minHeight: 40, maxWidth: '100%' }} value={card} onChange={(e) => setCard(e.target.value)} aria-label="Card to vault">
        <option value="">Card to vault</option>
        {ch.cards.loadout.map((id) => cardById.get(id)).filter(Boolean).map((x) => <option key={x!.id} value={x!.id}>{x!.name} (level {x!.level})</option>)}
      </select>
      <button className="s-mini solid" disabled={!c} onClick={() => { vault((x) => withGain(x, { hope: c!.level })); toast(`Channel Raw Power: +${c!.level} Hope.`); }}>+{c?.level ?? 'level'} Hope</button>
      <button className="s-mini" disabled={!c} onClick={() => { vault((x) => x); armAmount(ch.id, `${featureKey}:raw`, `+${2 * c!.level} spell damage (Channel Raw Power)`, { damage: { bonus: 2 * c!.level } }); }}>+{c ? 2 * c.level : '2×'} damage</button>
    </span>
  );
}

function UseBoxes({ ch, k, max, label, arm }: { ch: Character; k: string; max: number; label: string; arm?: { sides: number; source: string } }) {
  const used = ch.uses[k] ?? 0;
  const armed = usePlay((s) => s.armed[ch.id]) ?? armedFor(ch.id);
  const on = !!arm && armed.hopeDie?.useKey === k;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className="s-label s-muted" style={{ fontSize: 12 }}>{label}</span>
      {Array.from({ length: max }, (_, i) => {
        // With `arm`, the next free box arms the bigger Hope Die; it's marked when you roll.
        const next = arm && i === used;
        return (
          <button key={i} className={`s-check ${i < used ? 'on' : ''} ${next && on ? 'armed' : ''}`} aria-pressed={i < used || (!!next && on)}
            aria-label={next ? `${on ? 'Disarm' : 'Arm'} d${arm!.sides} Hope Die (${label})` : `${label}: use ${i + 1} ${i < used ? 'used' : 'available'}`}
            onClick={() => next
              ? toggleHopeDie(ch.id, arm!.sides, k, arm!.source)
              : updateCharacter(ch.id, (x) => ({ ...x, uses: { ...x.uses, [k]: i < used ? i : i + 1 } }))} />
        );
      })}
      {on ? <span className="s-label" style={{ fontSize: 12 }}>d{arm!.sides} Hope Die armed</span>
        : arm && used < max ? <span className="s-muted" style={{ fontSize: 12 }}>Tap to arm d{arm.sides} Hope Die</span>
        : used >= max ? <span className="s-muted" style={{ fontSize: 12 }}>Used</span> : null}
    </span>
  );
}

function tokenMax(ch: Character, source: TokenSource): number | null {
  const d = derive(ch);
  if ('fixed' in source) return source.fixed;
  if ('trait' in source) {
    const v = source.trait === 'spellcast' ? (d.spellcast ?? 0) : d.traits[source.trait];
    return Math.max(source.min ?? 0, v);
  }
  if ('stat' in source) return source.stat === 'tier' ? d.tier : source.stat === 'proficiency' ? d.proficiency : ch.level;
  return null;
}

function Tokens({ ch, k, source, label, max: cap }: { ch: Character; k: string; source: TokenSource; label: string; max?: number }) {
  const have = ch.uses[k] ?? 0;
  const max = tokenMax(ch, source);
  const shown = Math.max(have, max ?? 0, 'roll' in source ? source.roll.count * source.roll.sides + source.roll.bonus : 0);
  const setTo = (v: number) => updateCharacter(ch.id, (x) => ({ ...x, uses: { ...x.uses, [k]: Math.max(0, v) } }));
  const fill = () => {
    if ('roll' in source) setTo(dice('Tokens', source.roll.count, source.roll.sides, source.roll.bonus));
    else if (max !== null) setTo(max);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className="s-label" style={{ fontSize: 12 }}>{label}</span>
      {Array.from({ length: Math.min(12, shown) }, (_, i) => (
        <button key={i} className={`s-token ${i < have ? 'on' : 'spent'}`} aria-label={i < have ? `Spend token ${i + 1}` : `Token ${i + 1} spent`}
          disabled={i >= have} onClick={() => setTo(have - 1)} />
      ))}
      {'manual' in source ? (
        <>
          <button className="s-mini" aria-label="Remove a token" onClick={() => setTo(have - 1)}>−</button>
          <span className="s-num" style={{ fontSize: 18 }}>{have}</span>
          <button className="s-mini" aria-label="Add a token" disabled={cap !== undefined && have >= cap} onClick={() => setTo(have + 1)}>+</button>
        </>
      ) : (
        <button className="s-mini" onClick={fill}>{'roll' in source ? `Roll ${source.roll.count}d${source.roll.sides}${source.roll.bonus ? '+' + source.roll.bonus : ''}` : `Fill · ${max}`}</button>
      )}
      {have > 0 && !('manual' in source) && <button className="s-mini" onClick={() => setTo(0)}>Clear</button>}
    </div>
  );
}
