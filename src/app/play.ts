// Table-time state that isn't part of the saved character: what is armed
// for the next roll and the roll on screen.
import { useSyncExternalStore } from 'react';
import {
  ACTIVE, RESOURCES, activeName, applyOutcome, markStress, canPayStress, costLabel, damageRoll, derive, dualityRoll, roll, rollMany, scoreDuality, setActive,
  type Advantage, type ArmEffect, type Character, type Cost, type DamageRequest, type DamageResult, type DualityResult,
  type Resource, type RollModifier, ITEM_USE, activeCtx, carries, hasAncestryFeature, type Control, type ItemUse, hasFeature, starving, type Gain,
} from '../rules';
import { lootById, type TraitId } from '../data';
import { getCharacter, updateCharacter } from './store';
import { toast } from './toast';

/** Something armed by a feature: it changes the next roll, the next damage roll, or both. */
export interface Arm {
  key: string;
  label: string;
  /** Times armed (Rage Up can be armed twice). */
  count: number;
  /** Paid per arming; refunded when disarmed. */
  cost?: Cost;
  /** Stays armed until switched off (Sneak Attack, Ignition). */
  persist?: boolean;
  roll?: { value?: number; stat?: TraitId | 'proficiency'; advantage?: boolean; dice?: { count: number; sides: number }; attackOnly?: boolean;
    hopeBonus?: number; fearSides?: number; adept?: boolean;
    /** Only a roll of this trait ("+1 to your next Agility Roll"). */
    trait?: TraitId;
    /** The next successful attack critically succeeds: offered on the result card. */
    critOnHit?: boolean };
  damage?: { dice?: { count: number | 'tier'; sides: number }; bonus?: number; stat?: { trait: TraitId; times: number }; proficiency?: number; double?: boolean; dieSize?: number };
  /** The roll part was used; the damage part is still waiting for a damage roll. */
  rollDone?: boolean;
  /** Used up by whichever comes first, the roll or the damage roll (Slayer Dice). */
  either?: boolean;
  /** Tokens (or pooled dice) taken from a card's counter; given back when disarmed. */
  refundTo?: { key: string; n: number };
}

export interface Armed {
  advantage: Advantage;
  /** Experience indexes (1 Hope already spent on each). */
  experiences: number[];
  /** The Experience was free (Honed Expertise): nothing to refund. */
  experienceFree?: boolean;
  /** Other bonuses for the next roll. */
  extras: RollModifier[];
  /** "Roll a d20 as your Hope Die" armed by a feature (its use key is spent on the roll). */
  hopeDie?: { sides: number; useKey: string; source: string };
  arms: Arm[];
}

export interface DamageOptions { critical?: boolean; halfProf?: boolean }

export type RollView =
  | {
    kind: 'action'; title: string; sub?: string; result: DualityResult; effects: string[];
    charId: string; trait?: string; attack: boolean; reaction: boolean;
    /** An Experience was used on this roll. */
    experience: boolean;
    /** Hope gained / Stress cleared by this roll's outcome, undone if a reroll changes it. */
    applied: { hope: number; stress: number };
    /** Rerolls and follow-ups already used on this roll (by label). */
    rerolled: string[];
    /** Rolls this attack's damage (critical, or half Proficiency for Glancing Blow). */
    damageFn?: (o: DamageOptions) => void;
    /** Homet's Secret Potion was armed: offer to make a hit critical. */
    critOffer?: boolean;
  }
  | {
    kind: 'damage'; title: string; sub?: string; result: DamageResult; effects: string[];
    charId?: string; magic: boolean; attack: boolean; rerolled: string[];
  }
  | { kind: 'dice'; title: string; sub?: string; values: number[]; sides: number; bonus: number; total: number; effects: string[]; labels?: string[] };

interface State {
  armed: Record<string, Armed>;
  roll: (RollView & { rolling: boolean }) | null;
  /** Characters whose last attack roll was a critical: their next damage roll adds max dice. */
  crit: Record<string, boolean>;
  /** The Fear Die of each character's last action roll (Midnight-Touched). */
  lastFear: Record<string, number>;
}

const EMPTY: Armed = { advantage: 'none', experiences: [], extras: [], arms: [] };
let state: State = { armed: {}, roll: null, crit: {}, lastFear: {} };
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function usePlay<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => select(state),
  );
}

export function armedFor(id: string): Armed {
  return state.armed[id] ?? EMPTY;
}

function setArmed(id: string, a: Armed) {
  set({ armed: { ...state.armed, [id]: a } });
}

// ---- paying -------------------------------------------------------------------

/** Current Focus or Favor (Favor starts at 3). */
export function resourceOf(ch: Character, res: Resource): number {
  return ch.uses[`res:${res}`] ?? RESOURCES[res].start;
}

/** A character with a cost paid (negative `times` gives it back). */
export function withCost(c: Character, cost: Cost, times = 1): Character {
  if ('hope' in cost) return { ...c, hope: Math.max(0, Math.min(derive(c).hopeSlots, c.hope - cost.hope * times)) };
  if ('stress' in cost) return { ...c, stress: Math.max(0, c.stress + cost.stress * times) };
  const k = `res:${cost.res}`;
  return { ...c, uses: { ...c.uses, [k]: Math.max(0, Math.min(RESOURCES[cost.res].max, resourceOf(c, cost.res) - cost.n * times)) } };
}

export function canPay(ch: Character, cost?: Cost, times = 1): boolean {
  if (!cost) return true;
  if ('hope' in cost) return ch.hope >= cost.hope * times;
  if ('stress' in cost) return canPayStress(ch, cost.stress * times, derive(ch).stressSlots);
  return resourceOf(ch, cost.res) >= cost.n * times;
}

export function needText(cost: Cost, times = 1): string {
  if ('hope' in cost) return `You need ${cost.hope * times} Hope.`;
  if ('stress' in cost) return `You need ${cost.stress * times} unmarked Stress.`;
  return `You need ${cost.n * times} ${RESOURCES[cost.res].name}.`;
}

/** Pay a cost now; false (with a message) if you can't. */
export function pay(id: string, cost?: Cost, times = 1): boolean {
  if (!cost) return true;
  const ch = getCharacter(id);
  if (!ch) return false;
  if (!canPay(ch, cost, times)) { toast(needText(cost, times)); return false; }
  // Calming Pendant: "When you would mark your last Stress, roll a d6. On a result of 5 or higher, don't mark it."
  if ('stress' in cost && carries(ch, 'calming-pendant') && ch.stress + cost.stress * times === derive(ch).stressSlots) {
    const v = roll(6);
    if (v >= 5) {
      toast(`Calming Pendant: rolled ${v}, your last Stress isn't marked.`);
      updateCharacter(id, (c) => withCost(c, { stress: cost.stress * times - 1 }));
      return true;
    }
    toast(`Calming Pendant: rolled ${v}.`);
  }
  // Firbolg "Unshakable": "When you would mark a Stress, roll a d6. On a result of 6, don't mark it."
  if ('stress' in cost && hasAncestryFeature(ch, 'unshakable')) {
    const rolls = rollMany(cost.stress * times, 6);
    const kept = rolls.filter((v) => v === 6).length;
    if (kept) toast(`Unshakable: rolled ${rolls.join(', ')}, ${kept} Stress not marked.`);
    updateCharacter(id, (c) => withCost(c, { stress: cost.stress * times - kept }));
    return true;
  }
  updateCharacter(id, (c) => withCost(c, cost, times));
  return true;
}

/** Give back what an arm took from a card's counter (tokens, pooled dice). */
function refundCounter(id: string, x: Arm) {
  if (!x.refundTo) return;
  const { key, n } = x.refundTo;
  updateCharacter(id, (c) => ({ ...c, uses: { ...c.uses, [key]: (c.uses[key] ?? 0) + n } }));
}

function refund(id: string, cost: Cost | undefined, times: number) {
  if (!cost || times < 1) return;
  updateCharacter(id, (c) => withCost(c, cost, -times));
}

/** A character after a one-tap gain ("+2 Hope, clear 2 Stress"). */
export function withGain(c: Character, g: Gain): Character {
  const d = derive(c);
  const uses = { ...c.uses };
  if (g.res) uses[`res:${g.res.res}`] = Math.max(0, Math.min(RESOURCES[g.res.res].max, resourceOf(c, g.res.res) + g.res.n));
  for (const [k, n] of Object.entries(g.uses ?? {})) uses[k] = Math.max(0, (uses[k] ?? 0) + n);
  return {
    ...c,
    hope: Math.min(d.hopeSlots, c.hope + (g.hope ?? 0)),
    stress: Math.max(0, c.stress - (g.stress ?? 0)),
    hp: Math.max(c.permanentHp ?? 0, c.hp - (g.hp ?? 0)),
    armorMarked: Math.max(0, c.armorMarked - (g.armor ?? 0)),
    uses,
  };
}

export function gainText(g: Gain): string {
  const parts = [
    g.hope ? `+${g.hope} Hope` : '', g.stress ? `cleared ${g.stress} Stress` : '', g.hp ? `cleared ${g.hp} Hit Point${g.hp > 1 ? 's' : ''}` : '',
    g.armor ? `cleared ${g.armor} Armor Slot${g.armor > 1 ? 's' : ''}` : '', g.res ? `+${g.res.n} ${RESOURCES[g.res.res].name}` : '',
  ].filter(Boolean);
  return parts.join(', ');
}

/** Refocus: clear your Focus, roll your Instinct in d6s and keep the highest as Focus. */
export function refocus(id: string, useKey: string) {
  const ch = getCharacter(id);
  if (!ch) return;
  const n = Math.max(1, derive(ch).traits.instinct);
  const values = rollMany(n, 6);
  const best = Math.max(...values);
  updateCharacter(id, (c) => ({ ...c, uses: { ...c.uses, 'res:focus': Math.min(RESOURCES.focus.max, best), [useKey]: (c.uses[useKey] ?? 0) + 1 } }));
  show({ kind: 'dice', title: 'Refocus', sub: `${n}d6, keep the highest`, values, sides: 6, bonus: 0, total: best, effects: [`Focus is now ${Math.min(6, best)}.`] });
}

/** Roll a number of dice for a held set (Prayer Dice): kept with their values. */
export function rollHeld(id: string, store: string, count: number, sides: number, dropLowest = false) {
  const values = rollMany(count + (dropLowest ? 1 : 0), sides);
  const kept = dropLowest ? values.slice().sort((x, y) => y - x).slice(0, count) : values;
  updateCharacter(id, (c) => ({ ...c, heldDice: { ...(c.heldDice ?? {}), [store]: kept } }));
  return { values, kept };
}

/** Spend one held die (by index): returns its value. */
export function spendHeld(id: string, store: string, index: number): number {
  const ch = getCharacter(id);
  const v = ch?.heldDice?.[store]?.[index] ?? 0;
  updateCharacter(id, (c) => ({ ...c, heldDice: { ...(c.heldDice ?? {}), [store]: (c.heldDice?.[store] ?? []).filter((_, i) => i !== index) } }));
  return v;
}

/** Add a value to the roll on screen (a Prayer Die, Manipulate Magic's +2), action or damage. */
export function addToRoll(label: string, value: number, cost?: Cost) {
  const r = state.roll;
  if (!r) return;
  if (r.kind === 'action') {
    const result = scoreDuality({ ...r.result, modifiers: [...r.result.modifiers, { label, value }] });
    rescore(label, result, `${label}: +${value}${costText(cost)}.`, cost);
  } else if (r.kind === 'damage') addToDamage(label, value, cost);
}

/** Mark one use of a feature ("rest:card:arcana-arcana-touched"). */
export function useOnce(id: string, useKey?: string) {
  if (!useKey) return;
  updateCharacter(id, (c) => ({ ...c, uses: { ...c.uses, [useKey]: (c.uses[useKey] ?? 0) + 1 } }));
}

// ---- arming -------------------------------------------------------------------

export function toggleAdvantage(id: string, kind: 'advantage' | 'disadvantage') {
  const a = armedFor(id);
  setArmed(id, { ...a, advantage: a.advantage === kind ? 'none' : kind });
}

/**
 * Arm an Experience: spend 1 Hope now, add it to the next roll. Tap again to refund.
 * With Adept armed it costs a Stress instead (and counts double on the roll);
 * Honed Expertise rolls a d6 and gives the Hope back on a 5 or higher.
 */
export function toggleExperience(id: string, index: number) {
  const a = armedFor(id);
  const adept = a.arms.some((x) => x.roll?.adept);
  const cost: Cost = adept ? { stress: 1 } : { hope: 1 };
  if (a.experiences.includes(index)) {
    if (!a.experienceFree) refund(id, cost, 1);
    setArmed(id, { ...a, experiences: a.experiences.filter((i) => i !== index), experienceFree: false });
    return;
  }
  // One Experience at a time: switching moves the Hope already spent.
  if (a.experiences.length) {
    setArmed(id, { ...a, experiences: [index] });
    return;
  }
  const ch = getCharacter(id);
  if (!ch) return;
  let free = false;
  if (hasFeature(ch, 'honed-expertise')) {
    const d6 = roll(6);
    free = d6 >= 5;
    toast(`Honed Expertise: d6 = ${d6}${free ? ', no Hope needed.' : '.'}`);
  }
  if (!free && !pay(id, cost)) return;
  setArmed(id, { ...armedFor(id), experiences: [index], experienceFree: free });
}

/** Arm a bigger Hope Die for the next action roll (spends one use of the feature when rolled). */
export function toggleHopeDie(id: string, sides: number, useKey: string, source: string) {
  const a = armedFor(id);
  setArmed(id, { ...a, hopeDie: a.hopeDie?.source === source ? undefined : { sides, useKey, source } });
}

function armFromEffect(effect: ArmEffect): Pick<Arm, 'roll' | 'damage' | 'either'> {
  if ('roll' in effect) return { roll: { value: effect.roll } };
  if ('rollDie' in effect) return { roll: { dice: { count: 1, sides: effect.rollDie } } };
  if ('anyDie' in effect) return { either: true, roll: { dice: { count: 1, sides: effect.anyDie } }, damage: { dice: { count: 1, sides: effect.anyDie } } };
  if ('hopeBonus' in effect) return { roll: { hopeBonus: effect.hopeBonus } };
  if ('adept' in effect) return { roll: { adept: true } };
  if ('fearDie' in effect) return { roll: { fearSides: effect.fearDie } };
  if ('traitRoll' in effect) return { roll: { value: effect.value, trait: effect.traitRoll } };
  if ('critOnHit' in effect) return { roll: { critOnHit: true, attackOnly: true } };
  if ('rollStat' in effect) return { roll: { stat: effect.rollStat } };
  if ('advantage' in effect) return { roll: { advantage: true }, damage: effect.damageDice ? { dice: effect.damageDice } : undefined };
  if ('damageDice' in effect) return { damage: { dice: effect.damageDice } };
  if ('damageBonus' in effect) return { damage: { bonus: effect.damageBonus } };
  if ('damageStat' in effect) return { damage: { stat: { trait: effect.damageStat, times: effect.times } } };
  if ('proficiency' in effect) return { damage: { proficiency: effect.proficiency } };
  if ('damageDie' in effect) return { damage: { dieSize: effect.damageDie } };
  return { damage: { double: true } };
}

export interface ArmSpec {
  key: string; label: string; effect: ArmEffect; cost?: Cost; max?: number; persist?: boolean;
  /** Pay with tokens from this counter key. */
  tokens?: { key: string; n: number };
}

/**
 * Arm (paying the cost), arm again up to `max`, or disarm and refund. A
 * persistent arm stays on until switched off.
 */
export function toggleArm(id: string, spec: ArmSpec) {
  const a = armedFor(id);
  const have = a.arms.find((x) => x.key === spec.key);
  if (have && (!spec.max || have.count >= spec.max)) {
    refund(id, have.cost, have.rollDone ? 0 : have.count);
    if (!have.rollDone) refundCounter(id, have);
    setArmed(id, { ...armedFor(id), arms: a.arms.filter((x) => x.key !== spec.key) });
    return;
  }
  if (spec.tokens) {
    const ch = getCharacter(id);
    if (!ch || (ch.uses[spec.tokens.key] ?? 0) < spec.tokens.n) { toast('No tokens left on this card.'); return; }
  }
  if (!pay(id, spec.cost)) return;
  if (spec.tokens) {
    const t = spec.tokens;
    updateCharacter(id, (c) => ({ ...c, uses: { ...c.uses, [t.key]: Math.max(0, (c.uses[t.key] ?? 0) - t.n) } }));
  }
  const arms = have
    ? a.arms.map((x) => (x.key === spec.key ? { ...x, count: x.count + 1 } : x))
    : [...a.arms, { key: spec.key, label: spec.label, count: 1, cost: spec.cost, persist: spec.persist, refundTo: spec.tokens, ...armFromEffect(spec.effect) }];
  setArmed(id, { ...armedFor(id), arms });
}

/**
 * Arm pooled dice (Slayer Dice): taken off the card now, rolled into your next
 * attack roll or damage roll, whichever comes first. Tap again to put them back.
 */
export function togglePoolArm(id: string, poolKey: string, label: string, sides: number, anyRoll = false) {
  const a = armedFor(id);
  const key = `pool:${poolKey}`;
  const have = a.arms.find((x) => x.key === key);
  if (have) {
    refundCounter(id, have);
    setArmed(id, { ...a, arms: a.arms.filter((x) => x.key !== key) });
    return;
  }
  const n = getCharacter(id)?.uses[poolKey] ?? 0;
  if (n < 1) return;
  updateCharacter(id, (c) => ({ ...c, uses: { ...c.uses, [poolKey]: 0 } }));
  const dice = { count: n, sides };
  setArmed(id, { ...a, arms: [...a.arms, { key, label: `${n}d${sides} ${label}`, count: 1, either: true, refundTo: { key: poolKey, n },
    roll: { dice, attackOnly: !anyRoll }, damage: { dice } }] });
}

/** Arm a flat bonus with an amount ("spend 3 tokens: +3 to the roll"); replaces any earlier one. */
export function armAmount(id: string, key: string, label: string, part: Pick<Arm, 'roll' | 'damage'>) {
  const a = armedFor(id);
  setArmed(id, { ...a, arms: [...a.arms.filter((x) => x.key !== key), { key, label, count: 1, ...part }] });
}

export function clearArmed(id: string, refundAll = true) {
  const a = armedFor(id);
  if (refundAll) {
    const adept = a.arms.some((x) => x.roll?.adept);
    if (a.experiences.length && !a.experienceFree) refund(id, adept ? { stress: 1 } : { hope: 1 }, a.experiences.length);
    for (const x of a.arms) { refund(id, x.cost, x.rollDone ? 0 : x.count); if (!x.rollDone) refundCounter(id, x); }
  }
  setArmed(id, EMPTY);
}

export function armedText(id: string): string {
  const a = armedFor(id);
  const ch = getCharacter(id);
  if (!ch) return '';
  const d = derive(ch);
  const parts = [
    ...(ch.death === 'blaze' ? ['Blaze of Glory: automatic critical success'] : []),
    ...(a.hopeDie ? [`d${a.hopeDie.sides} Hope Die · ${a.hopeDie.source}`] : []),
    ...(a.advantage !== 'none' ? [a.advantage === 'advantage' ? 'Advantage' : 'Disadvantage'] : []),
    ...a.experiences.map((i) => `${d.experiences[i]?.name} +${d.experiences[i]?.value}`),
    ...a.extras.map((e) => `${e.label} ${e.value >= 0 ? '+' : ''}${e.value}`),
    ...a.arms.map((x) => `${x.label}${x.count > 1 ? ` ×${x.count}` : ''}${x.rollDone ? ' (damage)' : ''}`),
  ];
  return parts.join(' · ');
}

// ---- rolling ------------------------------------------------------------------

const ROLL_MS = 750;

function show(view: RollView) {
  set({ roll: { ...view, rolling: true } });
  setTimeout(() => {
    if (state.roll) set({ roll: { ...state.roll, rolling: false } });
  }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : ROLL_MS);
}

export function closeRoll() {
  set({ roll: null });
}

export function setCrit(id: string, on: boolean) {
  set({ crit: { ...state.crit, [id]: on } });
}

function outcomeDelta(before: Character, after: Character) {
  return { hope: after.hope - before.hope, stress: before.stress - after.stress };
}

export interface ActionOptions {
  attack?: boolean;
  /** The trait rolled (for trait-specific rerolls such as Nimble Fingers). */
  trait?: string;
  /** Reaction rolls don't generate Hope or Fear. */
  reaction?: boolean;
  /** Rolls this attack's damage, offered on the result card. */
  damageFn?: (o: DamageOptions) => void;
}

/**
 * Duality roll for a character with everything armed. Applies the outcome
 * (Hope on Hope; Hope + clear a Stress on a critical) and consumes what was armed.
 */
export function actionRoll(id: string, title: string, modifiers: RollModifier[], sub?: string, opts: ActionOptions | boolean = {}) {
  const o: ActionOptions = typeof opts === 'boolean' ? { attack: opts } : opts;
  let ch = getCharacter(id);
  if (!ch) return;
  const notes: string[] = [];
  // "Before you make an action roll, you must spend a Hope. If you can't, you revert."
  for (const key of ch.active ?? []) {
    if (!ACTIVE[key]?.hopeBeforeRoll || o.reaction) continue;
    if (ch.hope >= 1) { updateCharacter(id, (c) => ({ ...c, hope: c.hope - 1 })); notes.push('Spent a Hope to keep your form.'); }
    else { updateCharacter(id, (c) => setActive(c, key, false)); notes.push('No Hope to spend: you revert to your normal form.'); }
    ch = getCharacter(id)!;
  }
  const a = armedFor(id);
  const d = derive(ch);
  const rollArms = a.arms.filter((x) => x.roll && !x.rollDone && (!x.roll.attackOnly || o.attack) && (!x.roll.trait || x.roll.trait === o.trait));
  // Dice armed into the roll (Slayer Dice) are rolled now.
  const armDice = rollArms.filter((x) => x.roll!.dice).map((x) => {
    const values = slayerReroll(id, x, rollMany(x.roll!.dice!.count, x.roll!.dice!.sides), notes);
    return { label: `${x.label} (${values.join(', ')})`, value: values.reduce((s2, v) => s2 + v, 0) };
  });
  const counters = dieCounters(ch, 'action');
  const adept = rollArms.some((x) => x.roll!.adept) && a.experiences.length > 0;
  // Lasting effects that add dice to attack rolls (Wolf Form).
  const stateDice = o.attack ? (ch.active ?? []).flatMap((k) => (ACTIVE[k]?.attackDice?.(activeCtx(ch!, k)) ?? []).map((dd) => {
    const values = rollMany(dd.count, dd.sides);
    return { label: `${activeName(ch!, k)} ${dd.count}d${dd.sides} (${values.join(', ')})`, value: values.reduce((x, y) => x + y, 0) };
  })) : [];
  const mods = [
    ...counters.map((x) => ({ label: x.label, value: x.value })),
    ...modifiers,
    ...(d.actionBonus ? [{ label: 'Bonus to action rolls', value: d.actionBonus }] : []),
    ...a.experiences.map((i) => ({ label: `${d.experiences[i]?.name ?? 'Experience'}${adept ? ' (Adept ×2)' : ''}`, value: (d.experiences[i]?.value ?? 0) * (adept ? 2 : 1) })),
    ...a.extras,
    ...armDice,
    ...stateDice,
    ...rollArms.filter((x) => x.roll!.value !== undefined || x.roll!.stat).map((x) => ({
      label: x.label.split(' · ')[0],
      value: x.count * (x.roll!.value ?? (x.roll!.stat === 'proficiency' ? d.proficiency : d.traits[x.roll!.stat as TraitId])),
    })),
  ].filter((m) => m.value !== 0 || m.label !== 'Bonus to action rolls');
  let advantage = a.advantage;
  if (rollArms.some((x) => x.roll!.advantage)) advantage = advantage === 'disadvantage' ? 'none' : 'advantage';
  // Lasting effects that give disadvantage (Retract).
  for (const k of ch.active ?? []) if (ACTIVE[k]?.disadvantage && !o.reaction) { advantage = advantage === 'advantage' ? 'none' : 'disadvantage'; notes.push(`${activeName(ch, k)}: disadvantage.`); }
  // Vampire with no Feed tokens: disadvantage on action and reaction rolls.
  if (starving(ch)) { advantage = advantage === 'advantage' ? 'none' : 'disadvantage'; notes.push('Feed: no tokens, so you roll with disadvantage.'); }
  // Rise to the Challenge: with 2 or fewer Hit Points unmarked, a d20 Hope Die.
  const rising = hasFeature(ch, 'rise-to-the-challenge') && d.hitPoints - ch.hp <= 2;
  const hopeSides = a.hopeDie?.sides ?? (rising ? 20 : undefined);
  if (rising && !a.hopeDie) notes.push('Rise to the Challenge: d20 Hope Die.');
  const fearSides = rollArms.find((x) => x.roll!.fearSides)?.roll!.fearSides;
  const hopeBonus = rollArms.reduce((t, x) => t + (x.roll!.hopeBonus ?? 0), 0);
  const blaze = ch.death === 'blaze';
  const result = dualityRoll({ label: title, modifiers: mods, advantage, hopeSides, fearSides, hopeBonus, forceCritical: blaze });
  if (hopeBonus) notes.push(`Hope Die +${hopeBonus} (Contacts Everywhere).`);
  const effects = o.reaction ? ['Reaction roll: no Hope or Fear is generated.'] : outcomeEffects(ch, result, !!o.attack);
  effects.push(...notes);
  if (blaze) effects.push('Blaze of Glory: after this action you cross through the veil of death.');
  const before = ch;
  const after = o.reaction ? ch : applyOutcome(ch, result);
  updateCharacter(id, (c) => {
    let next = o.reaction ? c : applyOutcome(c, result);
    if (a.hopeDie?.useKey) next = { ...next, uses: { ...next.uses, [a.hopeDie.useKey]: (next.uses[a.hopeDie.useKey] ?? 0) + 1 } };
    if (blaze) next = { ...next, death: 'dead' };
    return next;
  });
  // Spend what was armed: roll-only arms go; arms with a damage part wait for the damage roll.
  const used = new Set(rollArms.map((x) => x.key));
  const arms = a.arms.flatMap((x) => (!used.has(x.key) || x.persist ? [x] : x.either || !x.damage ? [] : [{ ...x, rollDone: true }]));
  // "After you add its value to a roll, increase the die's value by one" (Wild Surge).
  for (const x of counters) {
    const next = x.value + 1;
    updateCharacter(id, (c) => ({ ...c, uses: { ...c.uses, [x.key]: next > x.sides ? 0 : next } }));
    effects.push(next > x.sides ? `${x.label}: the die would go past ${x.sides}, so it ends.` : `${x.label} goes up to ${next}.`);
  }
  // Seaborne "Know the Tide": "When you roll with Fear, place a token on your community card" (up to your level).
  if (result.outcome === 'fear' && !o.reaction && ch.communityId === 'seaborne') {
    const tk = 'tokens:com:know-the-tide';
    updateCharacter(id, (c) => ({ ...c, uses: { ...c.uses, [tk]: Math.min(c.level, (c.uses[tk] ?? 0) + 1) } }));
    effects.push('Know the Tide: a token on your community card.');
  }
  // Lasting effects that react to the roll.
  for (const k of getCharacter(id)?.active ?? []) {
    const def = ACTIVE[k];
    // Wolf Form: "When you roll with Hope while in Wolf Form, you must mark a Stress."
    if (def?.stressOnHope && result.outcome === 'hope' && !o.reaction) {
      updateCharacter(id, (c) => markStress(c, 1, derive(c).stressSlots, derive(c).hitPoints));
      effects.push('Wolf Form: rolling with Hope marks a Stress.');
    }
    // Lionheart Tonic: lasts "until you roll with Fear".
    if (def?.endsOnFear && result.outcome === 'fear' && !o.reaction) {
      updateCharacter(id, (c) => setActive(c, k, false));
      effects.push(`${activeName(getCharacter(id)!, k)} ends: you rolled with Fear.`);
    }
    // Circle of Power: each action roll removes a token; the last one ends it.
    if (def?.tokens) {
      const tk = `tokens:${k}`;
      const left = Math.max(0, (getCharacter(id)?.uses[tk] ?? 0) - 1);
      updateCharacter(id, (c) => (left ? { ...c, uses: { ...c.uses, [tk]: left } } : setActive({ ...c, uses: { ...c.uses, [tk]: 0 } }, k, false)));
      effects.push(left ? `${activeName(getCharacter(id)!, k)}: a token removed (${left} left).` : `${activeName(getCharacter(id)!, k)}: the last token is gone, so it ends.`);
    }
  }
  setArmed(id, { ...EMPTY, arms });
  set({ lastFear: { ...state.lastFear, [id]: result.fear } });
  if (o.attack) set({ crit: { ...state.crit, [id]: result.outcome === 'critical' } });
  show({
    kind: 'action', title, sub, result, effects, charId: id, trait: o.trait, attack: !!o.attack, reaction: !!o.reaction,
    experience: a.experiences.length > 0, applied: outcomeDelta(before, after), rerolled: [], damageFn: o.damageFn,
    critOffer: rollArms.some((x) => x.roll!.critOnHit),
  });
}

/** Make the action roll on screen a critical success (Homet's Secret Potion on a hit). */
export function makeItCritical(label: string) {
  const r = state.roll;
  if (!r || r.kind !== 'action') return;
  rescore(label, { ...r.result, outcome: 'critical' }, `${label}: a critical success.`);
  const after = state.roll;
  if (after && after.kind === 'action') set({ roll: { ...after, critOffer: false } });
}

/** Weapon Specialist: "once per long rest when you roll your Slayer Dice, reroll any 1s." */
function slayerReroll(id: string, x: Arm, values: number[], notes: string[]): number[] {
  const ch = getCharacter(id);
  const useKey = 'longRest:sub:weapon-specialist';
  if (!ch || !/^pool:pool:(sub|mcsub):slayer$/.test(x.key) || !hasFeature(ch, 'weapon-specialist') || (ch.uses[useKey] ?? 0) >= 1 || !values.includes(1)) return values;
  const sides = x.roll?.dice?.sides ?? x.damage?.dice?.sides ?? 6;
  const next = values.map((v) => (v === 1 ? roll(sides) : v));
  updateCharacter(id, (c) => ({ ...c, uses: { ...c.uses, [useKey]: 1 } }));
  notes.push(`Weapon Specialist: rerolled the 1s (${values.join(', ')} → ${next.join(', ')}).`);
  return next;
}

function outcomeEffects(ch: Character, result: DualityResult, attack: boolean): string[] {
  const effects: string[] = [];
  const full = ch.hope >= derive(ch).hopeSlots;
  if (result.outcome === 'hope') effects.push(full ? 'With Hope (Hope is full).' : 'You gain a Hope.');
  if (result.outcome === 'critical') effects.push('Critical success: you gain a Hope and clear a Stress.');
  if (result.outcome === 'fear') effects.push('The GM gains a Fear.');
  if (attack && result.outcome === 'critical') effects.push('Your damage is critical: roll it below.');
  return effects;
}

/** Replace the action roll on screen with a new result, undoing the old outcome's Hope/Stress first. */
function rescore(label: string, result: DualityResult, note: string, cost?: Cost, useKey?: string) {
  const r = state.roll;
  if (!r || r.kind !== 'action') return;
  const id = r.charId;
  const ch = getCharacter(id);
  if (!ch) return;
  let base: Character = { ...ch, hope: ch.hope - r.applied.hope, stress: ch.stress + r.applied.stress };
  if (cost) {
    if (!canPay(base, cost)) { toast(needText(cost)); return; }
    base = withCost(base, cost);
  }
  const after = r.reaction ? base : applyOutcome(base, result);
  updateCharacter(id, () => (useKey ? { ...after, uses: { ...after.uses, [useKey]: (after.uses[useKey] ?? 0) + 1 } } : after));
  if (r.attack) set({ crit: { ...state.crit, [id]: result.outcome === 'critical' } });
  set({ lastFear: { ...state.lastFear, [id]: result.fear } });
  const effects = [...(r.reaction ? r.effects.slice(0, 1) : outcomeEffects(base, result, r.attack)), note];
  show({ ...r, result, effects, applied: outcomeDelta(base, after), rerolled: [...r.rerolled, label] });
}

const costText = (cost?: Cost) => (cost ? ` (${costLabel(cost)})` : '');

/** Reroll the Hope Die (Internal Compass, Nimble Fingers, Feline Instincts). */
export function rerollHopeDie(label: string, hopeCost = 0) {
  const r = state.roll;
  if (!r || r.kind !== 'action') return;
  const result = scoreDuality({ ...r.result, hope: roll(r.result.hopeSides) });
  const cost = hopeCost ? { hope: hopeCost } : undefined;
  rescore(label, result, `Rerolled the Hope Die with ${label}${costText(cost)}: ${r.result.hope} → ${result.hope}.`, cost);
}

/** Reroll the Fear Die (Endless Charisma). */
export function rerollFearDie(label: string, cost?: Cost, useKey?: string) {
  const r = state.roll;
  if (!r || r.kind !== 'action') return;
  const result = scoreDuality({ ...r.result, fear: roll(r.result.fearSides ?? 12) });
  rescore(label, result, `Rerolled the Fear Die with ${label}${costText(cost)}: ${r.result.fear} → ${result.fear}.`, cost, useKey);
}

/** Reroll both Duality Dice (Luckbender, Adaptability), optionally with advantage (Warlock). */
export function rerollDuality(label: string, cost?: Cost, useKey?: string, withAdvantage = false) {
  const r = state.roll;
  if (!r || r.kind !== 'action') return;
  const advantage: Advantage = withAdvantage ? 'advantage' : r.result.advantage;
  const advantageDie = advantage === 'none' ? null : roll(6);
  const result = scoreDuality({ ...r.result, hope: roll(r.result.hopeSides), fear: roll(r.result.fearSides ?? 12), advantage, advantageDie });
  rescore(label, result, `Rerolled with ${label}${withAdvantage ? ' (advantage)' : ''}${costText(cost)}: ${r.result.total} → ${result.total}.`, cost, useKey);
}

/** Swap the Hope and Fear Dice (Arcana-Touched, Nemesis). */
export function swapDuality(label: string, useKey?: string) {
  const r = state.roll;
  if (!r || r.kind !== 'action') return;
  const result = scoreDuality({ ...r.result, hope: r.result.fear, fear: r.result.hope });
  rescore(label, result, `Swapped the Hope and Fear Dice with ${label}.`, undefined, useKey);
}

/** "Change it into a roll with Hope instead" (Fearless, Freeborne, Stealth Expertise). */
export function makeItHope(label: string, cost?: Cost, useKey?: string) {
  const r = state.roll;
  if (!r || r.kind !== 'action') return;
  rescore(label, { ...r.result, outcome: 'hope' }, `${label}: now a roll with Hope${costText(cost)}.`, cost, useKey);
}

/** Add a die to the action roll's total after rolling (Heart of a Poet). */
export function addDieToRoll(label: string, sides: number, cost?: Cost) {
  const r = state.roll;
  if (!r || r.kind !== 'action') return;
  const v = roll(sides);
  const result = scoreDuality({ ...r.result, modifiers: [...r.result.modifiers, { label: `${label} d${sides}`, value: v }] });
  rescore(label, result, `${label}: +${v} (d${sides})${costText(cost)}.`, cost);
}

/** Extra effects you apply from the result card (Gore and Glory, Champion's Edge, Pummeljoy). */
export function applyFromResult(label: string, fn: (c: Character) => Character, cost?: Cost, note?: string) {
  const r = state.roll;
  if (!r || !('charId' in r) || !r.charId) return;
  if (!pay(r.charId, cost)) return;
  updateCharacter(r.charId, fn);
  set({ roll: { ...state.roll!, effects: [...r.effects, note ?? label], rerolled: [...r.rerolled, label] } as State['roll'] });
}

/** On a roll with Hope, take a pooled die (Slayer Dice) instead of the Hope. */
export function takePoolDie(label: string, poolKey: string, max: number) {
  const r = state.roll;
  if (!r || r.kind !== 'action') return;
  const id = r.charId;
  const gained = r.applied.hope;
  updateCharacter(id, (c) => ({ ...c, hope: Math.max(0, c.hope - gained), uses: { ...c.uses, [poolKey]: Math.min(max, (c.uses[poolKey] ?? 0) + 1) } }));
  set({ roll: { ...state.roll!, applied: { ...r.applied, hope: 0 }, effects: [...r.effects, `${label}: took a die instead of a Hope.`], rerolled: [...r.rerolled, label] } as State['roll'] });
}

// ---- damage -------------------------------------------------------------------

export function damage(title: string, req: DamageRequest, sub?: string, effects: string[] = [], opts: { charId?: string; magic?: boolean; attack?: boolean } = {}) {
  let rq = req;
  const notes = [...effects];
  let double = false;
  if (opts.attack && opts.charId) {
    const ch = getCharacter(opts.charId);
    // A counting die that adds to damage (Unstoppable).
    const counters = ch ? dieCounters(ch, 'damage') : [];
    if (counters.length) rq = { ...rq, modifiers: [...(rq.modifiers ?? []), ...counters.map((x) => ({ label: x.label, value: x.value }))] };
    // Lasting effects that add damage dice (Patron's Fury, Wolf Form) or an extra die (Aggressive stance).
    if (ch) {
      for (const k of ch.active ?? []) {
        const def = ACTIVE[k];
        const extra = def?.damageDice?.(activeCtx(ch, k)) ?? [];
        if (extra.length) { rq = { ...rq, dice: [...rq.dice, ...extra] }; notes.push(`${activeName(ch, k)}: +${extra.map((x) => `${x.count}d${x.sides}`).join('+')}.`); }
        if (def?.extraDamageDie && !rq.extraDieDropLowest) { rq = { ...rq, extraDieDropLowest: true }; notes.push(`${activeName(ch, k)}: an extra die, lowest dropped.`); }
      }
    }
    const a = armedFor(opts.charId);
    const dmgArms = a.arms.filter((x) => x.damage);
    if (ch && dmgArms.length) {
      const d = derive(ch);
      const dice = [...rq.dice];
      const mods = [...(rq.modifiers ?? [])];
      for (const x of dmgArms) {
        const dm = x.damage!;
        const name = x.label.split(' · ')[0];
        if (dm.proficiency && dice.length) dice[0] = { ...dice[0], count: dice[0].count + dm.proficiency * x.count };
        if (dm.dieSize && dice.length) dice[0] = { ...dice[0], sides: dm.dieSize };
        if (dm.dice && /^pool:pool:(sub|mcsub):slayer$/.test(x.key) && hasFeature(ch, 'weapon-specialist')) {
          const values = slayerReroll(opts.charId, x, rollMany(dm.dice.count as number, dm.dice.sides), notes);
          mods.push({ label: `${x.label} (${values.join(', ')})`, value: values.reduce((a2, v) => a2 + v, 0) });
        } else if (dm.dice) dice.push({ count: (dm.dice.count === 'tier' ? d.tier : dm.dice.count) * x.count, sides: dm.dice.sides });
        if (dm.bonus) mods.push({ label: name, value: dm.bonus * x.count });
        if (dm.stat) mods.push({ label: name, value: d.traits[dm.stat.trait] * dm.stat.times * x.count });
        if (dm.double) double = true;
        notes.push(`Armed: ${x.label}${x.count > 1 ? ` ×${x.count}` : ''}.`);
      }
      rq = { ...rq, dice, modifiers: mods };
      setArmed(opts.charId, { ...a, arms: a.arms.filter((x) => x.persist || !x.damage) });
    }
  }
  const result = damageRoll(rq);
  if (double) {
    result.modifiers = [...result.modifiers, { label: 'Doubled', value: result.total }];
    result.total *= 2;
    result.rolls = result.rolls.map((g) => ({ ...g }));
  }
  show({ kind: 'damage', title, sub, result, effects: notes, charId: opts.charId, magic: !!opts.magic, attack: !!opts.attack, rerolled: [] });
}

/** Key a die counter stores its value under in `uses`: "die:damage:6:class:unstoppable". */
export function dieKey(addsTo: string | undefined, sides: number, featureKey: string): string {
  return `die:${addsTo ?? 'none'}:${sides}:${featureKey}`;
}

/** Active die counters that add to a kind of roll. */
function dieCounters(ch: Character, kind: 'damage' | 'action') {
  return Object.entries(ch.uses).filter(([k, v]) => k.startsWith(`die:${kind}:`) && v > 0).map(([k, v]) => {
    const [, , sides, source, id] = k.split(':');
    // "class:unstoppable" → Unstoppable; "card:sage-wild-surge" → Wild Surge (drop the domain).
    const words = (id ?? '').split('-').slice(source === 'card' ? 1 : 0);
    const name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return { key: k, value: v, sides: Number(sides), label: `${name} Die` };
  });
}

function retotal(r: DamageResult): number {
  return r.rolls.reduce((a, g) => a + g.values.reduce((x, y) => x + y, 0), 0) + r.critBonus + r.bonus + r.modifiers.reduce((a, m) => a + m.value, 0);
}

/** Reroll chosen damage dice (Not Good Enough: 1s and 2s; Volatile Magic: any, for 3 Hope). */
export function rerollDamage(label: string, pick: (value: number, group: number, index: number) => boolean, hopeCost = 0) {
  const r = state.roll;
  if (!r || r.kind !== 'damage') return;
  if (hopeCost && (!r.charId || !pay(r.charId, { hope: hopeCost }))) return;
  const rolls = r.result.rolls.map((g, gi) => ({ ...g, values: g.values.map((v, i) => (pick(v, gi, i) ? roll(g.sides) : v)) }));
  const next = { ...r.result, rolls };
  const total = retotal(next);
  show({ ...r, result: { ...next, total }, effects: [...r.effects, `Rerolled with ${label}: ${r.result.total} → ${total}.`], rerolled: [...r.rerolled, label] });
}

/** Use the maximum of your lowest damage die (Versatile Fighter). */
export function maxOneDamageDie(label: string, cost?: Cost) {
  const r = state.roll;
  if (!r || r.kind !== 'damage' || !r.charId || !pay(r.charId, cost)) return;
  let best = { g: -1, i: -1, gain: 0 };
  r.result.rolls.forEach((g, gi) => g.values.forEach((v, i) => { if (g.sides - v > best.gain) best = { g: gi, i, gain: g.sides - v }; }));
  if (best.g < 0) return;
  const rolls = r.result.rolls.map((g, gi) => ({ ...g, values: g.values.map((v, i) => (gi === best.g && i === best.i ? g.sides : v)) }));
  const next = { ...r.result, rolls };
  const total = retotal(next);
  show({ ...r, result: { ...next, total }, effects: [...r.effects, `${label}: a die counts as its maximum (${r.result.total} → ${total}).`], rerolled: [...r.rerolled, label] });
}

/** Add a flat amount to the damage on screen (Midnight-Touched: your Fear Die). */
export function addToDamage(label: string, value: number, cost?: Cost) {
  const r = state.roll;
  if (!r || r.kind !== 'damage' || !r.charId || !pay(r.charId, cost)) return;
  const next = { ...r.result, modifiers: [...r.result.modifiers, { label, value }] };
  show({ ...r, result: { ...next, total: retotal(next) }, effects: [...r.effects, `${label}: +${value}.`], rerolled: [...r.rerolled, label] });
}

export function lastFearDie(id: string): number | undefined {
  return state.lastFear[id];
}

/** Add extra dice to the damage roll on screen (Rampage: a d10 for each 1). */
export function addDamageDice(label: string, count: number, sides: number) {
  const r = state.roll;
  if (!r || r.kind !== 'damage' || count < 1) return;
  const extra = rollMany(count, sides);
  const rolls = [...r.result.rolls, { sides, values: extra, dropped: null }];
  const total = r.result.total + extra.reduce((a, b) => a + b, 0);
  show({ ...r, result: { ...r.result, rolls, total }, effects: [...r.effects, `${label}: +${extra.join(' +')}.`], rerolled: [...r.rerolled, label] });
}

/** Plain dice ("roll a d6", "1d4+1 tokens"). */
export function dice(title: string, count: number, sides: number, bonus = 0, sub?: string, effects: string[] = []) {
  const values = count <= 1 ? [roll(sides)] : rollMany(count, sides);
  const total = values.reduce((a, b) => a + b, 0) + bonus;
  show({ kind: 'dice', title, sub, values, sides, bonus, total, effects });
  return total;
}

/** Show dice already rolled by a rules function (death moves). */
export function showDice(title: string, values: number[], labels: string[], effects: string[], sub?: string) {
  show({ kind: 'dice', title, sub, values, sides: 12, bonus: 0, total: 0, effects, labels });
}

/** Roll Patron Dice and count results of `atLeast` or more (Deathless Embrace clears that many Hit Points). */
export function countDice(id: string, title: string, count: number, sides: number, atLeast: number, clearHp: boolean, note?: string) {
  const values = rollMany(count, sides);
  const hits = values.filter((v) => v >= atLeast).length;
  if (clearHp && hits) updateCharacter(id, (c) => ({ ...c, hp: Math.max(0, c.hp - hits) }));
  const effects = [clearHp ? `${hits} result${hits === 1 ? '' : 's'} of ${atLeast}+: cleared ${hits} Hit Point${hits === 1 ? '' : 's'}.`
    : `${hits} result${hits === 1 ? '' : 's'} of ${atLeast}+${note ? `: ${note}` : ''}.`];
  show({ kind: 'dice', title, sub: `${count}d${sides}`, values, sides, bonus: 0, total: hits, effects });
}

/** Double the highest damage die on screen (Manipulate Magic). */
export function doubleDamageDie(label: string, cost?: Cost) {
  const r = state.roll;
  if (!r || r.kind !== 'damage' || !r.charId || !pay(r.charId, cost)) return;
  let best = { g: -1, i: -1, v: 0 };
  r.result.rolls.forEach((g, gi) => g.values.forEach((v, i) => { if (v > best.v) best = { g: gi, i, v }; }));
  if (best.g < 0) return;
  const next = { ...r.result, modifiers: [...r.result.modifiers, { label: `${label} (doubled ${best.v})`, value: best.v }] };
  show({ ...r, result: { ...next, total: retotal(next) }, effects: [...r.effects, `${label}: doubled a ${best.v}${costText(cost)}.`], rerolled: [...r.rerolled, label] });
}

/** Damage dice that rolled a 1 count as their highest value (Exacting stance). */
export function onesToMax(label: string) {
  const r = state.roll;
  if (!r || r.kind !== 'damage') return;
  const rolls = r.result.rolls.map((g) => ({ ...g, values: g.values.map((v) => (v === 1 ? g.sides : v)) }));
  const next = { ...r.result, rolls };
  const total = retotal(next);
  show({ ...r, result: { ...next, total }, effects: [...r.effects, `${label}: 1s count as their highest (${r.result.total} → ${total}).`], rerolled: [...r.rerolled, label] });
}

/** Double the damage on screen (First Strike). */
export function doubleDamageTotal(label: string, useKey?: string) {
  const r = state.roll;
  if (!r || r.kind !== 'damage' || !r.charId) return;
  if (useKey) useOnce(r.charId, useKey);
  const next = { ...r.result, modifiers: [...r.result.modifiers, { label, value: r.result.total }] };
  show({ ...r, result: { ...next, total: r.result.total * 2 }, effects: [...r.effects, `${label}: double damage.`], rerolled: [...r.rerolled, label] });
}

/**
 * Combo Strike: roll the Combo Die, keep rolling until a result is lower than
 * the one before; add the total as extra damage.
 */
export function comboStrike(label: string, sides: number, cost: Cost) {
  const r = state.roll;
  if (!r || r.kind !== 'damage' || !r.charId || !pay(r.charId, cost)) return;
  const chain: number[] = [roll(sides)];
  while (chain.length < 50) {
    const v = roll(sides);
    chain.push(v);
    if (v < chain[chain.length - 2]) break;
  }
  const extra = chain.reduce((a, b) => a + b, 0);
  const next = { ...r.result, modifiers: [...r.result.modifiers, { label: `${label} (${chain.join(', ')})`, value: extra }] };
  show({ ...r, result: { ...next, total: retotal(next) }, effects: [...r.effects, `${label}${costText(cost)}: d${sides} ${chain.join(' → ')} = +${extra}.`], rerolled: [...r.rerolled, label] });
}

/**
 * Use a consumable: apply what it does (see ITEM_USE), then take one from the stack.
 * Returns false when it couldn't be used (a cost you can't pay).
 */
export function useItem(id: string, index: number, use?: ItemUse): boolean {
  const ch = getCharacter(id);
  const it = ch?.items[index];
  const loot = it ? lootById.get(it.id) : undefined;
  if (!ch || !it || !loot) return false;
  const u = use ?? ITEM_USE[loot.id];
  const consume = () => updateCharacter(id, (c) => ({ ...c, items: c.items.flatMap((x, j) => (j === index ? (x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : []) : [x])) }));
  if (u && 'choose' in u) return false;
  if (u && 'gain' in u) {
    if (!pay(id, u.cost)) return false;
    updateCharacter(id, (c) => withGain(c, u.gain));
    toast(`${loot.name}: ${[gainText(u.gain), u.note].filter(Boolean).join('. ') || 'used'}.`);
  } else if (u && 'heal' in u) {
    const total = dice(loot.name, u.heal.count, u.heal.sides, u.heal.bonus);
    const g: Gain = { [u.heal.what]: total };
    updateCharacter(id, (c) => withGain(withGain(c, g), u.also ?? {}));
  } else if (u && 'arm' in u) {
    toggleArm(id, { key: `item:${loot.id}:${Date.now()}`, label: u.label, effect: u.arm, persist: false });
    toast(`${u.label}: armed.`);
  } else if (u && 'active' in u) {
    updateCharacter(id, (c) => setActive(c, u.active, true));
    toast(`${loot.name}: in effect (see Items).`);
  } else if (u && 'attack' in u) {
    consume();
    naturalAttackFn?.(id, u.attack);
    return true;
  } else if (u && 'damage' in u) {
    damage(loot.name, { dice: [{ count: u.damage.count, sides: u.damage.sides }], bonus: 0 }, `${u.damage.count}d${u.damage.sides} ${u.damage.type}`, [], { charId: id, magic: u.damage.type === 'magic' });
  } else if (u && 'special' in u) {
    const d = derive(ch);
    switch (u.special) {
      case 'clearAll': updateCharacter(id, (c) => ({ ...c, hp: c.permanentHp ?? 0, stress: 0 })); toast(`${loot.name}: cleared all Hit Points and Stress.`); break;
      case 'clearStress': updateCharacter(id, (c) => ({ ...c, stress: 0 })); toast(`${loot.name}: cleared all Stress.`); break;
      case 'feast': {
        const h = dice(loot.name, 1, 4, 0, 'Clear all HP and Stress, gain 1d4 Hope');
        updateCharacter(id, (c) => withGain({ ...c, hp: c.permanentHp ?? 0, stress: 0 }, { hope: h }));
        break;
      }
      case 'sunTreeSap': {
        const v = rollMany(1, 6)[0];
        const what = v >= 5 ? 'Clear 2 HP.' : v >= 2 ? 'Clear 3 Stress.' : 'You see through the veil of death and return changed: gain a scar.';
        updateCharacter(id, (c) => (v >= 5 ? withGain(c, { hp: 2 }) : v >= 2 ? withGain(c, { stress: 3 }) : { ...c, scars: (c.scars ?? 0) + 1, hope: Math.min(c.hope, derive({ ...c, scars: (c.scars ?? 0) + 1 }).hopeSlots) }));
        show({ kind: 'dice', title: loot.name, sub: 'd6', values: [v], sides: 6, bonus: 0, total: v, effects: [what] });
        break;
      }
      case 'snakeskin': updateCharacter(id, (c) => ({ ...c, scars: Math.max(0, (c.scars ?? 0) - 1) })); toast(ch.scars ? `${loot.name}: a scar heals (Hope slot back).` : `${loot.name}: you have no scars.`); break;
      case 'cockerel': updateCharacter(id, (c) => ({ ...c, uses: Object.fromEntries(Object.entries(c.uses).filter(([k]) => !k.startsWith('rest:') && !k.startsWith('longRest:'))) })); toast(`${loot.name}: your features refresh as after a long rest.`); break;
      case 'armorStitcher': {
        const n = Math.min(ch.hope, ch.armorMarked);
        if (!n) { toast(ch.armorMarked ? 'You need Hope to use it.' : 'No Armor Slots are marked.'); return false; }
        updateCharacter(id, (c) => ({ ...c, hope: c.hope - n, armorMarked: c.armorMarked - n }));
        toast(`${loot.name}: spent ${n} Hope, cleared ${n} Armor Slot${n > 1 ? 's' : ''}.`);
        break;
      }
      case 'darksmoke': {
        const n = Math.max(1, d.traits.agility);
        const values = rollMany(n, 6);
        show({ kind: 'dice', title: loot.name, sub: `${n}d6, keep the highest`, values, sides: 6, bonus: 0, total: Math.max(...values), effects: [`+${Math.max(...values)} to your Evasion against this attack.`] });
        break;
      }
    }
  } else {
    // Not in the table: roll what its text rolls ("Clear 1d4 HP").
    const m = /\b(?:clear|gain) (\d+)d(\d+)(?:\+(\d+))? (HP|Hit Points?|Stress|Hope|Armor Slots?)/i.exec(loot.text);
    if (m) {
      const total = dice(loot.name, Number(m[1]), Number(m[2]), Number(m[3] ?? 0));
      const w = m[4].toLowerCase();
      updateCharacter(id, (c) => withGain(c, w === 'hope' ? { hope: total } : w === 'stress' ? { stress: total } : w.startsWith('armor') ? { armor: total } : { hp: total }));
    } else toast(`Used ${loot.name}.`);
  }
  consume();
  return true;
}

/** Set by the attack module (it imports this one): rolls a non-weapon attack. */
let naturalAttackFn: ((id: string, c: Extract<Control, { kind: 'natural' }>) => void) | undefined;
export function registerNaturalAttack(fn: typeof naturalAttackFn) { naturalAttackFn = fn; }
