// Death moves (SRD "Death"): when a PC marks their last Hit Point.
import { rules } from '../data';
import { defaultRng, roll, type Rng } from './dice';
import { derive } from './derive';
import type { Character } from './model';
import { carries } from './items';

/** Marked their last Hit Point and hasn't chosen a death move yet. */
export function mustMakeDeathMove(ch: Character): boolean {
  return !ch.death && ch.hp >= derive(ch).hitPoints;
}

/** Blaze of Glory: one final action that automatically critically succeeds, then death. */
export function blazeOfGlory(ch: Character): Character {
  const { beastform: _, ...c } = ch;
  return { ...c, death: 'blaze' };
}

export interface AvoidDeathResult {
  character: Character;
  hopeDie: number;
  scarred: boolean;
  /** Crossed out the last Hope slot. */
  journeyEnds: boolean;
}

/** Avoid Death: drop unconscious, then roll the Hope Die; at or under your level you gain a scar. */
export function avoidDeath(ch: Character, rng: Rng = defaultRng): AvoidDeathResult {
  const hopeDie = roll(12, rng);
  // Phoenix Feather: "+1 bonus to the roll you make to determine whether you gain a scar."
  const scarred = hopeDie + (carries(ch, 'phoenix-feather') ? 1 : 0) <= ch.level;
  const scars = (ch.scars ?? 0) + (scarred ? 1 : 0);
  const slots = Math.max(0, rules.caps.hope - scars);
  const { beastform: _, ...c } = ch;
  const journeyEnds = slots === 0;
  return {
    character: { ...c, scars, hope: Math.min(ch.hope, slots), death: journeyEnds ? 'dead' : 'unconscious' },
    hopeDie, scarred, journeyEnds,
  };
}

export interface RiskItAllResult {
  hope: number;
  fear: number;
  /** 'clear': stay up and clear Hope-die points; 'all': clear all HP and Stress; 'dead': cross the veil. */
  outcome: 'clear' | 'all' | 'dead';
  character: Character;
}

/**
 * Risk It All: roll the Duality Dice. On a higher Hope Die you clear points equal
 * to it, split between HP and Stress as you like (`toHp` of them go to HP;
 * the rest to Stress, any excess is lost).
 */
export function riskItAll(ch: Character, rng: Rng = defaultRng): RiskItAllResult {
  // Reliquary of the Sightless Saint: "+1 bonus to your Hope Die when you make the Risk It All death move."
  const hope = roll(12, rng) + (carries(ch, 'reliquary-of-the-sightless-saint') ? 1 : 0);
  const fear = roll(12, rng);
  const { beastform: _, ...c } = ch;
  if (hope === fear) return { hope, fear, outcome: 'all', character: { ...c, hp: 0, stress: 0 } };
  if (fear > hope) return { hope, fear, outcome: 'dead', character: { ...c, death: 'dead' } };
  return { hope, fear, outcome: 'clear', character: splitClear(c, hope, Math.min(hope, c.hp)) };
}

export function splitClear(ch: Character, points: number, toHp: number): Character {
  const hp = Math.max(0, Math.min(points, toHp));
  return { ...ch, hp: Math.max(ch.permanentHp ?? 0, ch.hp - hp), stress: Math.max(0, ch.stress - (points - hp)) };
}

/** An ally clears 1 or more of your Hit Points: you regain consciousness. */
export function wake(ch: Character, cleared = 1): Character {
  return { ...ch, death: undefined, hp: Math.max(0, ch.hp - cleared) };
}

/**
 * Set marked Hit Points from the sheet. Marking the last one drops you out of
 * Beastform; clearing one while unconscious wakes you.
 */
export function setHitPoints(ch: Character, hp: number): Character {
  const max = derive(ch).hitPoints;
  let c: Character = { ...ch, hp: Math.max(ch.permanentHp ?? 0, Math.min(max, hp)) };
  if (c.hp >= max && c.beastform) { const { beastform: _, ...rest } = c; c = rest; }
  if (c.death === 'unconscious' && c.hp < ch.hp) c = { ...c, death: undefined };
  return c;
}
