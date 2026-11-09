// Items and consumables (SRD "Loot"): what using a consumable does, and what
// carried items do on their own. Text the app can't act on stays the item's text.
import { lootById, type TraitId } from '../data';
import type { Modifier } from './effects';
import type { ArmEffect, Control, Cost, Gain } from './mechanics';
import type { Character } from './model';
import { TRAIT_IDS } from './model';

/** What tapping Use on a consumable does (the item is then used up). */
export type ItemUse =
  | { gain: Gain; cost?: Cost; note?: string }
  /** Clear HP, Stress or Armor, or gain Hope: a roll ("Clear 1d4+1 HP"). */
  | { heal: { what: 'hp' | 'stress' | 'hope' | 'armor'; count: number; sides: number; bonus: number }; also?: Gain }
  /** Choose one ("clear 1d10 HP or 1d10 Stress"). */
  | { choose: { label: string; use: ItemUse }[] }
  /** Armed for your next roll or damage roll. */
  | { arm: ArmEffect; label: string }
  /** A lasting effect (an ACTIVE key) switched on. */
  | { active: string }
  /** An attack (shards, Dragonbloom Tea). */
  | { attack: Extract<Control, { kind: 'natural' }> }
  /** Damage dealt with no attack roll (Stardrop, Jar of Lost Voices). */
  | { damage: { count: number; sides: number; type: 'magic' | 'physical' } }
  | { special: 'sunTreeSap' | 'feast' | 'cockerel' | 'armorStitcher' | 'snakeskin' | 'darksmoke' | 'clearAll' | 'clearStress' };

const stat = (t: TraitId) => t.charAt(0).toUpperCase() + t.slice(1);
const POTION_TRAITS: Record<string, TraitId> = { stride: 'agility', bolster: 'strength', control: 'finesse', attune: 'instinct', charm: 'presence', enlighten: 'knowledge' };

export const ITEM_USE: Record<string, ItemUse> = {
  'varik-leaves': { gain: { hope: 2 } },
  'snap-powder': { gain: { hp: 1 }, cost: { stress: 1 } },
  'sleeping-sap': { special: 'clearStress' },
  'feast-of-xuria': { special: 'feast' },
  'godlings-pomelo': { special: 'clearAll' },
  'sweet-moss': { choose: [
    { label: 'Clear 1d10 HP', use: { heal: { what: 'hp', count: 1, sides: 10, bonus: 0 } } },
    { label: 'Clear 1d10 Stress', use: { heal: { what: 'stress', count: 1, sides: 10, bonus: 0 } } },
  ] },
  'self-sewing-thread': { choose: [
    { label: 'Clear a Hit Point', use: { gain: { hp: 1 } } },
    { label: 'Clear 2 Armor Slots', use: { gain: { armor: 2 } } },
  ] },
  'sun-tree-sap': { special: 'sunTreeSap' },
  'snakeskin-spirit': { special: 'snakeskin' },
  'cockerel-claw-tea': { special: 'cockerel' },
  'armor-stitcher': { special: 'armorStitcher' },
  'vial-of-darksmoke': { special: 'darksmoke' },
  'mnemonic-potion': { gain: { hope: 1 }, note: 'Use an Experience without spending a Hope (the Hope is added for it).' },
  'grindletooth-venom': { arm: { damageDice: { count: 1, sides: 6 } }, label: '+1d6 next damage (Grindletooth Venom)' },
  'improved-grindletooth-venom': { arm: { damageDice: { count: 1, sides: 8 } }, label: '+1d8 next damage (Improved Grindletooth Venom)' },
  'redthorn-saliva': { arm: { damageDice: { count: 1, sides: 12 } }, label: '+1d12 next damage (Redthorn Saliva)' },
  'mythic-dust': { arm: { damageDice: { count: 1, sides: 12 } }, label: '+1d12 next magic damage (Mythic Dust)' },
  'red-ooze-oil': { arm: { damageDice: { count: 1, sides: 8 } }, label: '+1d8 magic, Ignites (Red Ooze Oil)' },
  'green-ooze-oil': { arm: { damageDice: { count: 1, sides: 8 } }, label: '+1d8 magic, Corrodes (Green Ooze Oil)' },
  'demiurges-draught': { arm: { proficiency: 1 }, label: '+1 Proficiency next hit (Demiurge’s Draught)' },
  'homets-secret-potion': { arm: { critOnHit: true }, label: 'Next hit is a critical (Homet’s Secret Potion)' },
  'unstable-arcane-shard': { attack: { kind: 'natural', trait: 'finesse', dice: { count: 1, sides: 20 }, type: 'magic', label: 'Unstable Arcane Shard' } },
  'improved-arcane-shard': { attack: { kind: 'natural', trait: 'finesse', dice: { count: 2, sides: 20 }, type: 'magic', label: 'Improved Arcane Shard' } },
  'major-arcane-shard': { attack: { kind: 'natural', trait: 'finesse', dice: { count: 4, sides: 20 }, type: 'magic', label: 'Major Arcane Shard' } },
  'dragonbloom-tea': { attack: { kind: 'natural', trait: 'instinct', dice: { count: 'proficiency', sides: 20 }, type: 'physical', label: 'Dragonbloom Tea' } },
  'stardrop': { damage: { count: 8, sides: 20, type: 'physical' } },
  'jar-of-lost-voices': { damage: { count: 6, sides: 8, type: 'magic' } },
  'dripfang-poison': { damage: { count: 8, sides: 10, type: 'magic' } },
  'emberite-shard': { damage: { count: 3, sides: 6, type: 'magic' } },
  'arcticite-shard': { damage: { count: 3, sides: 6, type: 'magic' } },
  'fulgurite-shard': { damage: { count: 3, sides: 6, type: 'magic' } },
  'circle-of-the-void': { gain: {}, cost: { stress: 1 }, note: 'No magic can be cast in the void; creatures in it are immune to magic damage.' },
  'morphing-clay': { gain: {}, cost: { hope: 1 }, note: 'Unrecognizable until your next rest.' },
  'mirror-of-marigold': { gain: {}, cost: { hope: 1 }, note: 'The damage is negated; the mirror shatters.' },
  'shrinking-potion': { active: 'item:shrinking-potion' },
  'growing-potion': { active: 'item:growing-potion' },
  'drakemantle': { active: 'item:drakemantle' },
  'steelskin-salve': { active: 'item:steelskin-salve' },
  'featherstep-potion': { active: 'item:featherstep-potion' },
  'potion-of-vigilance': { active: 'item:potion-of-vigilance' },
  'lionheart-tonic': { active: 'item:lionheart-tonic' },
  'berserkers-brew': { active: 'item:berserkers-brew' },
};
for (const [p, t] of Object.entries(POTION_TRAITS)) {
  ITEM_USE[`${p}-potion`] = { arm: { traitRoll: t, value: 1 }, label: `+1 next ${stat(t)} Roll` };
  ITEM_USE[`major-${p}-potion`] = { active: `item:major-${p}-potion` };
}

/** Relics: "+1 to a trait. You can only carry one relic" (the first one carried counts). */
const RELIC_TRAITS: Record<string, TraitId> = Object.fromEntries(Object.entries(POTION_TRAITS).map(([p, t]) => [`${p}-relic`, t]));

const has = (ch: Character, id: string) => ch.items.some((x) => x.id === id && x.qty > 0);

/** Stat changes from items you carry. */
export function itemModifiers(ch: Character): Modifier[] {
  const out: Modifier[] = [];
  const relic = ch.items.find((x) => RELIC_TRAITS[x.id] || x.id === 'honing-relic' || x.id === 'communion-relic' || x.id === 'augurs-relic');
  if (relic && RELIC_TRAITS[relic.id]) out.push({ stat: RELIC_TRAITS[relic.id], value: 1, source: lootById.get(relic.id)?.name ?? 'Relic' });
  return out;
}

/** Honing Relic: +1 to the first Experience (the SRD lets you choose; see FLAGS.md). */
export function honingRelicExperience(ch: Character): number | null {
  const relic = ch.items.find((x) => RELIC_TRAITS[x.id] || ['honing-relic', 'communion-relic', 'augurs-relic'].includes(x.id));
  return relic?.id === 'honing-relic' && ch.experiences.length ? 0 : null;
}

/** A gem attached to your primary weapon: attack with that trait instead. */
export function gemTrait(ch: Character): TraitId | null {
  const gem = ch.items.find((x) => x.id.startsWith('gem-of-'));
  if (!gem) return null;
  const by: Record<string, TraitId> = { alacrity: 'agility', might: 'strength', precision: 'finesse', insight: 'instinct', audacity: 'presence', sagacity: 'knowledge' };
  return by[gem.id.slice(7)] ?? null;
}

/** Greatstone on a featureless primary weapon: "roll an additional damage die and discard the lowest". */
export function greatstone(ch: Character): boolean {
  return has(ch, 'greatstone');
}

/** Bloodstone on a featureless primary weapon: Brutal ("When you roll the maximum value on a damage die, roll an additional damage die"). */
export function bloodstone(ch: Character): boolean {
  return has(ch, 'bloodstone');
}

export function carries(ch: Character, id: string): boolean {
  return has(ch, id);
}

export const TRAIT_LIST = TRAIT_IDS;
