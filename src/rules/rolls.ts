// Duality rolls, damage rolls and damage severity.
import { rules } from '../data';
import { defaultRng, roll, rollMany, type Rng } from './dice';
import type { Character } from './model';

export type Advantage = 'none' | 'advantage' | 'disadvantage';

export interface RollModifier {
  label: string;
  value: number;
}

export interface DualityRequest {
  /** What is being rolled, e.g. "Agility" or "Attack · Longsword". */
  label: string;
  modifiers: RollModifier[];
  /** Advantage and disadvantage cancel; only one can apply to a roll. */
  advantage?: Advantage;
  /** Sides of the Hope Die (12; 20 with "roll a d20 as your Hope Die"). */
  hopeSides?: number;
  /** Sides of the Fear Die (12; 20 with Vampire "Feed"). */
  fearSides?: number;
  /** Added to the Hope Die's result (Contacts Everywhere). */
  hopeBonus?: number;
  /** Blaze of Glory: the action automatically critically succeeds. */
  forceCritical?: boolean;
}

export type Outcome = 'hope' | 'fear' | 'critical';

export interface DualityResult {
  label: string;
  hope: number;
  fear: number;
  hopeSides: number;
  /** 12 unless a feature changes it. */
  fearSides?: number;
  advantage: Advantage;
  advantageDie: number | null;
  modifiers: RollModifier[];
  total: number;
  outcome: Outcome;
}

export function dualityRoll(req: DualityRequest, rng: Rng = defaultRng): DualityResult {
  const hopeSides = req.hopeSides ?? 12;
  const hope = roll(hopeSides, rng) + (req.hopeBonus ?? 0);
  const fear = req.forceCritical ? hope : roll(req.fearSides ?? 12, rng);
  const advantage = req.advantage ?? 'none';
  const advantageDie = advantage === 'none' ? null : roll(6, rng);
  return scoreDuality({ label: req.label, hope, fear, hopeSides, fearSides: req.fearSides ?? 12, advantage, advantageDie, modifiers: req.modifiers }, req.forceCritical);
}

/** Total and outcome for a set of duality dice (also used after a reroll). */
export function scoreDuality(r: Omit<DualityResult, 'total' | 'outcome'>, forceCritical = false): DualityResult {
  const adv = r.advantageDie === null ? 0 : r.advantage === 'advantage' ? r.advantageDie : -r.advantageDie;
  const total = r.hope + r.fear + adv + r.modifiers.reduce((a, m) => a + m.value, 0);
  const outcome: Outcome = forceCritical || r.hope === r.fear ? 'critical' : r.hope > r.fear ? 'hope' : 'fear';
  return { ...r, total, outcome };
}

/** With Hope: gain a Hope. Critical: gain a Hope and clear a Stress. With Fear: the GM gains a Fear. */
export function applyOutcome(ch: Character, result: Pick<DualityResult, 'outcome'>): Character {
  if (result.outcome === 'fear') return ch;
  return {
    ...ch,
    hope: Math.min(rules.caps.hope - (ch.scars ?? 0), ch.hope + 1),
    stress: result.outcome === 'critical' ? Math.max(0, ch.stress - 1) : ch.stress,
  };
}

export interface DamageRequest {
  dice: { count: number; sides: number }[];
  bonus: number;
  modifiers?: RollModifier[];
  critical?: boolean;
  /** Massive / Powerful: roll one extra die of the first group and drop the lowest. */
  extraDieDropLowest?: boolean;
  /** Brutal: "When you roll the maximum value on a damage die, roll an additional damage die" (and again on another maximum). */
  brutal?: boolean;
}

export interface DamageResult {
  rolls: { sides: number; values: number[]; dropped: number | null }[];
  critBonus: number;
  bonus: number;
  modifiers: RollModifier[];
  total: number;
}

export function damageRoll(req: DamageRequest, rng: Rng = defaultRng): DamageResult {
  const rolls = req.dice.map((d, i) => {
    const values = rollMany(d.count + (i === 0 && req.extraDieDropLowest ? 1 : 0), d.sides, rng);
    let dropped: number | null = null;
    if (i === 0 && req.extraDieDropLowest && values.length) {
      const min = Math.min(...values);
      values.splice(values.indexOf(min), 1);
      dropped = min;
    }
    if (req.brutal) for (let k = 0; k < values.length && values.length < 60; k++) if (values[k] === d.sides) values.push(roll(d.sides, rng));
    return { sides: d.sides, values, dropped };
  });
  // Critical: add the maximum possible result of the damage dice.
  const critBonus = req.critical ? req.dice.reduce((a, d) => a + d.count * d.sides, 0) : 0;
  const modifiers = req.modifiers ?? [];
  const total = rolls.reduce((a, r) => a + r.values.reduce((x, y) => x + y, 0), 0)
    + critBonus + req.bonus + modifiers.reduce((a, m) => a + m.value, 0);
  return { rolls, critBonus, bonus: req.bonus, modifiers, total };
}

export type Severity = 'none' | 'minor' | 'major' | 'severe';
const ORDER: Severity[] = ['none', 'minor', 'major', 'severe'];

export function severityOf(damage: number, t: { major: number; severe: number }): Severity {
  if (damage <= 0) return 'none';
  if (damage >= t.severe) return 'severe';
  if (damage >= t.major) return 'major';
  return 'minor';
}

export function hpForSeverity(s: Severity): number {
  return ORDER.indexOf(s);
}

/** Mark Hit Points for incoming damage. Marking one Armor Slot reduces the severity by one threshold. */
export function takeDamage(
  ch: Character,
  damage: number,
  thresholds: { major: number; severe: number },
  armorScore: number,
  maxHp: number,
  useArmor: boolean,
): { character: Character; severity: Severity; hpMarked: number; armorUsed: boolean } {
  let severity = severityOf(damage, thresholds);
  const canArmor = useArmor && severity !== 'none' && armorScore > 0 && ch.armorMarked < armorScore;
  if (canArmor) severity = ORDER[ORDER.indexOf(severity) - 1];
  const hpMarked = hpForSeverity(severity);
  return {
    character: {
      ...ch,
      hp: Math.min(maxHp, ch.hp + hpMarked),
      armorMarked: ch.armorMarked + (canArmor ? 1 : 0),
    },
    severity,
    hpMarked,
    armorUsed: canArmor,
  };
}

export function spendHope(ch: Character, n: number): Character {
  if (n > ch.hope) throw new Error(`Not enough Hope (${ch.hope}/${n}).`);
  return { ...ch, hope: ch.hope - n };
}

/**
 * Mark Stress forced on you (by the GM or an effect). SRD: "When a character must
 * mark 1 or more Stress but can’t, they mark 1 HP instead." If only part of it
 * fits, the rest also becomes that 1 HP (see FLAGS.md).
 */
export function markStress(ch: Character, n: number, maxStress: number, maxHp: number): Character {
  const free = maxStress - ch.stress;
  const overflow = n > free;
  return { ...ch, stress: Math.min(maxStress, ch.stress + n), hp: overflow ? Math.min(maxHp, ch.hp + 1) : ch.hp };
}

/** "A character can’t use a move that requires them to mark Stress if all of their Stress is marked." */
export function canPayStress(ch: Character, n: number, maxStress: number): boolean {
  return ch.stress + n <= maxStress;
}
