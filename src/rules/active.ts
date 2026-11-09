// Lasting effects you switch on by paying a feature's cost: they change your
// stats until they end (a rest, a long rest, the end of the scene, or when you
// end them). Some ask you to choose (a stance, an element, two benefits).
import type { TraitId } from '../data';
import type { Modifier } from './effects';
import type { Character } from './model';
import { TRAIT_IDS } from './model';
import type { Cost, UseScope } from './mechanics';

export interface ActiveCtx {
  traits: Record<TraitId, number>;
  spellcast: number | null;
  proficiency: number;
  tier: number;
  level: number;
  /** Options chosen when it was switched on. */
  opts: string[];
  /** A subclass or class feature you have ("elemental-dominion"). */
  has: (featureId: string) => boolean;
}

export type Ends = 'rest' | 'longRest' | 'scene' | 'session' | 'manual';

export interface ActiveDef {
  /** What the effect does, shown while it's on. */
  note: string | ((ctx: ActiveCtx) => string);
  ends: Ends;
  /** Pay this to switch it on (when the text's first cost isn't it). */
  cost?: Cost;
  /** Switching it on uses the feature for this long. */
  once?: UseScope;
  /** One effect of a group at a time (martial stances). */
  group?: string;
  /** Choose when switching it on; `pick` of them (default 1). Options sharing a `set` exclude each other. */
  options?: { id: string; label: string; set?: string }[];
  pick?: number;
  /** Label of the switch-on button when there's no cost ("I'm Vulnerable"). */
  start?: string;
  /** "Before you make an action roll, you must spend a Hope. If you can't, you revert." */
  hopeBeforeRoll?: boolean;
  /** Retract: disadvantage on action rolls while it's on. */
  disadvantage?: boolean;
  /** Frenzy: you can't use Armor Slots. */
  noArmorSlots?: boolean;
  /** Extra dice on your damage rolls while it's on (Patron's Fury). */
  damageDice?: (ctx: ActiveCtx) => { count: number; sides: number }[];
  /** Dice added to your attack rolls while it's on (Wolf Form). */
  attackDice?: (ctx: ActiveCtx) => { count: number; sides: number }[];
  /** Ends when you roll with Fear (Lionheart Tonic). */
  endsOnFear?: boolean;
  /** "When you roll with Hope while in Wolf Form, you must mark a Stress." */
  stressOnHope?: boolean;
  /** Roll an additional damage die and discard the lowest (Aggressive stance). */
  extraDamageDie?: boolean;
  /** Tokens placed when it starts; your action rolls remove one; it ends with the last (Circle of Power). */
  tokens?: (ctx: ActiveCtx) => number;
  effects: (ctx: ActiveCtx) => Omit<Modifier, 'source'>[];
}

const thresholds = (v: number): Omit<Modifier, 'source'>[] => [{ stat: 'major', value: v }, { stat: 'severe', value: v }];
const TRAIT_OPTS = TRAIT_IDS.map((t) => ({ id: t, label: t.charAt(0).toUpperCase() + t.slice(1) }));
const STANCE = { ends: 'scene' as const, group: 'stance', cost: { res: 'focus', n: 1 } as Cost };
/** Patron Die: d6, a d8 from level 5. */
export const patronDie = (level: number) => (level >= 5 ? 8 : 6);

/** Keyed by feature key (see FeatureCard): "card:<id>", "hope:<class>", "sub:<id>", "stance:<id>". */
export const ACTIVE: Record<string, ActiveDef> = {
  'card:valor-full-surge': {
    note: '+2 to all traits until your next rest.', ends: 'rest',
    effects: () => TRAIT_IDS.map((t) => ({ stat: t, value: 2 })),
  },
  'card:blade-frenzy': {
    note: '+10 to damage rolls, +8 to your Severe threshold; you can’t use Armor Slots.', ends: 'manual', noArmorSlots: true,
    effects: () => [{ stat: 'damage', value: 10 }, { stat: 'severe', value: 8 }],
  },
  'card:sage-force-of-nature': {
    note: '+10 to damage rolls on a successful attack or Spellcast Roll; you spend a Hope before each action roll.', ends: 'manual', hopeBeforeRoll: true,
    effects: () => [{ stat: 'damage', value: 10 }],
  },
  'card:dread-avatar-of-terror': {
    note: 'A 1d6 bonus to damage rolls for each Fear in the GM’s pool; you spend a Hope before each action roll.', ends: 'manual', hopeBeforeRoll: true,
    effects: () => [],
  },
  'card:splendor-overwhelming-aura': {
    note: 'Your Presence equals your Spellcast trait until your next long rest.', ends: 'longRest',
    effects: ({ traits, spellcast }) => (spellcast !== null && spellcast !== traits.presence ? [{ stat: 'presence', value: spellcast - traits.presence }] : []),
  },
  'hope:warrior': {
    note: '+1 to your attack rolls until your next rest.', ends: 'rest',
    effects: () => [{ stat: 'attack', value: 1, appliesTo: 'all' }],
  },
  'hope:rogue': {
    note: '+2 Evasion until an attack succeeds against you (or your next rest).', ends: 'rest',
    effects: () => [{ stat: 'evasion', value: 2 }],
  },

  // ---- Martial stances: one at a time, a Focus to shift in, until the scene ends.
  'stance:favored': { ...STANCE, options: TRAIT_OPTS, note: ({ opts }) => `+${opts[0] ?? 'trait'} to damage rolls.`,
    effects: ({ traits, opts }) => (opts[0] ? [{ stat: 'damage', value: traits[opts[0] as TraitId] }] : []) },
  'stance:invigorating': { ...STANCE, note: 'On a successful attack, roll a d4 (the result card offers it): on a 4, gain a Focus.', effects: () => [] },
  'stance:quick': { ...STANCE, note: 'When you attack, spend a Focus or mark a Stress to target another creature in range.', effects: () => [] },
  'stance:reliable': { ...STANCE, note: '+1 to your attack rolls.', effects: () => [{ stat: 'attack', value: 1, appliesTo: 'all' }] },
  'stance:aggressive': { ...STANCE, note: '−1 Evasion; your damage rolls add a die and drop the lowest.', extraDamageDie: true, effects: () => [{ stat: 'evasion', value: -1 }] },
  'stance:anchored': { ...STANCE, note: '+2 to your damage thresholds; you can’t be moved against your will.', effects: () => thresholds(2) },
  'stance:defensive': { ...STANCE, note: 'Melee attacks against you have disadvantage unless the attacker marks a Stress.', effects: () => [] },
  'stance:otherworldly': { ...STANCE, note: 'On a successful attack, deal physical or magic damage.', effects: () => [] },
  'stance:grappling': { ...STANCE, note: 'On a successful Melee attack, spend a Focus or mark a Stress to Restrain the target or throw it up to Close range.', effects: () => [] },
  'stance:scary': { ...STANCE, note: 'On a successful attack, the target marks a Stress.', effects: () => [] },
  'stance:stable': { ...STANCE, note: 'Spend a Focus instead of an Armor Slot to reduce damage.', effects: () => [] },
  'stance:vigilant': { ...STANCE, note: 'When targeted by an attack, mark a Stress for +d6 Evasion against it.', effects: () => [] },
  'stance:crushing': { ...STANCE, note: 'On Severe damage, spend a Hope: the target marks an extra Hit Point.', effects: () => [] },
  'stance:exacting': { ...STANCE, note: 'Damage dice that roll a 1 count as their highest value (on the result card).', effects: () => [] },
  'stance:honed': { ...STANCE, note: 'Spend a Focus before an attack roll: +1 Proficiency for that attack.', effects: () => [] },
  'stance:isolating': { ...STANCE, note: 'Advantage on attacks with no other creatures within Very Close range of you or your target.', effects: () => [] },

  // ---- Subclass states.
  'sub:elemental-incarnation': {
    ends: 'rest', cost: { stress: 1 },
    options: [{ id: 'fire', label: 'Fire' }, { id: 'earth', label: 'Earth' }, { id: 'water', label: 'Water' }, { id: 'air', label: 'Air' }],
    note: ({ opts, has, proficiency }) => ({
      fire: `Channeling Fire: an adversary in Melee that damages you takes 1d10 magic damage.${has('elemental-dominion') ? ' +1 Proficiency on damage.' : ''}`,
      earth: `Channeling Earth: +${proficiency} to your damage thresholds.${has('elemental-dominion') ? ' Marking Hit Points: a d6 each, every 6 marks one fewer.' : ''}`,
      water: `Channeling Water: dealing damage in Melee makes other adversaries within Very Close mark a Stress.${has('elemental-dominion') ? ' When an attack hits you, mark a Stress to make the attacker Vulnerable.' : ''}`,
      air: `Channeling Air: you hover, with advantage on Agility Rolls.${has('elemental-dominion') ? ' +1 Evasion, and you can fly.' : ''}`,
    } as Record<string, string>)[opts[0]] ?? 'Channeling.',
    effects: ({ opts, has, proficiency }) => [
      ...(opts[0] === 'earth' ? thresholds(proficiency) : []),
      ...(opts[0] === 'air' && has('elemental-dominion') ? [{ stat: 'evasion' as const, value: 1 }] : []),
      ...(opts[0] === 'fire' && has('elemental-dominion') ? [{ stat: 'proficiency' as const, value: 1 }] : []),
    ],
  },
  'sub:transcendence': {
    ends: 'rest', once: 'longRest', pick: 2,
    options: [{ id: 'severe', label: '+4 Severe' }, { id: 'proficiency', label: '+1 Proficiency' }, { id: 'evasion', label: '+2 Evasion' },
      ...TRAIT_OPTS.map((t) => ({ ...t, label: `+1 ${t.label}`, set: 'trait' }))],
    note: ({ opts }) => `Transcended: ${opts.map((o) => ({ severe: '+4 Severe', proficiency: '+1 Proficiency', evasion: '+2 Evasion' } as Record<string, string>)[o] ?? `+1 ${o.charAt(0).toUpperCase() + o.slice(1)}`).join(', ')} until your next rest.`,
    effects: ({ opts }) => opts.flatMap((o): Omit<Modifier, 'source'>[] => (o === 'severe' ? [{ stat: 'severe', value: 4 }]
      : o === 'proficiency' ? [{ stat: 'proficiency', value: 1 }] : o === 'evasion' ? [{ stat: 'evasion', value: 2 }]
      : [{ stat: o as TraitId, value: 1 }])),
  },
  'sub:arcane-charge': {
    ends: 'longRest', cost: { hope: 2 }, start: 'Charged',
    note: 'Charged: after a successful magic attack, clear it on the damage result for +10 damage.', effects: () => [],
  },
  'sub:patrons-mantle': {
    ends: 'scene', cost: { res: 'favor', n: 1 },
    note: ({ tier }) => `+${tier} to your damage thresholds and advantage to intimidate, until you take Severe damage or the scene ends.`,
    effects: ({ tier }) => thresholds(tier),
  },
  'sub:patrons-fury': {
    ends: 'scene', cost: { res: 'favor', n: 1 },
    note: ({ tier, level }) => `Your damage rolls add ${tier}d${patronDie(level)} Patron Dice, until you deal Severe damage or the scene ends.`,
    damageDice: ({ tier, level }) => [{ count: tier, sides: patronDie(level) }],
    effects: () => [],
  },
  'sub:adrenaline': {
    ends: 'manual', start: 'I’m Vulnerable',
    note: ({ level }) => `Vulnerable: +${level} to your damage rolls.`,
    effects: ({ level }) => [{ stat: 'damage', value: level }],
  },
  'sub:moonbeam': {
    ends: 'scene', once: 'session', start: 'Conjure moonlight',
    note: 'Moonlight: you and your allies in it get +1 to Spellcast Rolls and see through illusions.',
    effects: () => [{ stat: 'spellcast', value: 1 }],
  },
  'sub:circle-of-power': {
    ends: 'manual', once: 'rest', start: 'Mark the circle',
    tokens: ({ spellcast }) => Math.max(1, spellcast ?? 1),
    note: 'In the circle: +2 to damage thresholds, attack rolls and Evasion. Each of your action rolls removes a token (tap a token for an ally’s roll or an evaded attack).',
    effects: () => [...thresholds(2), { stat: 'attack', value: 2, appliesTo: 'all' }, { stat: 'evasion', value: 2 }],
  },

  // ---- Ancestries.
  'anc:retract': {
    ends: 'manual', cost: { stress: 1 }, disadvantage: true, start: 'Retract',
    note: 'In your shell: resistance to physical damage, disadvantage on action rolls, and you can’t move.', effects: () => [],
  },
  'anc:eye-of-the-storm': {
    ends: 'manual', cost: { hope: 2 },
    note: '+1 Evasion (you, or an ally in Melee) until you take Severe damage or use this again.', effects: () => [{ stat: 'evasion', value: 1 }],
  },

  // ---- Consumables (switched on by using the item).
  ...Object.fromEntries((['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'] as TraitId[]).map((t, i) => [
    `item:major-${['stride', 'bolster', 'control', 'attune', 'charm', 'enlighten'][i]}-potion`,
    { ends: 'rest' as const, note: `+1 ${t.charAt(0).toUpperCase() + t.slice(1)} until your next rest.`, effects: () => [{ stat: t, value: 1 }] },
  ])),
  'item:shrinking-potion': { ends: 'rest', note: 'Half size: +2 Agility, −1 Proficiency until you drop this form or rest.',
    effects: () => [{ stat: 'agility', value: 2 }, { stat: 'proficiency', value: -1 }] },
  'item:growing-potion': { ends: 'rest', note: 'Double size: +2 Strength, +1 Proficiency until you drop this form or rest.',
    effects: () => [{ stat: 'strength', value: 2 }, { stat: 'proficiency', value: 1 }] },
  'item:drakemantle': { ends: 'scene', note: 'Draconic: you can fly, +5 to damage thresholds, +1 Proficiency until the end of the scene.',
    effects: () => [...thresholds(5), { stat: 'proficiency', value: 1 }] },
  'item:steelskin-salve': { ends: 'scene', note: ({ tier }) => `+${tier} to damage thresholds until the end of the scene.`, effects: ({ tier }) => thresholds(tier) },
  'item:featherstep-potion': { ends: 'rest', note: ({ tier }) => `+${tier} Evasion until your next rest.`, effects: ({ tier }) => [{ stat: 'evasion', value: tier }] },
  'item:potion-of-vigilance': { ends: 'manual', note: '+1 Evasion until you mark a Hit Point (End it then).', effects: () => [{ stat: 'evasion', value: 1 }] },
  'item:lionheart-tonic': { ends: 'manual', endsOnFear: true, note: '+1 Proficiency until you roll with Fear.', effects: () => [{ stat: 'proficiency', value: 1 }] },
  'item:berserkers-brew': { ends: 'rest', note: ({ traits }) => { const v = Math.max(1, traits.instinct); return `+${v} Strength, −${v} Finesse and Knowledge until a death move or your next rest.`; },
    effects: ({ traits }) => { const v = Math.max(1, traits.instinct); return [{ stat: 'strength', value: v }, { stat: 'finesse', value: -v }, { stat: 'knowledge', value: -v }]; } },
  'item:insomniacs-periapt': { ends: 'rest', note: '+2 to attack and damage rolls until your next rest.',
    effects: () => [{ stat: 'attack', value: 2, appliesTo: 'all' }, { stat: 'damage', value: 2 }] },
  'item:eclipse-coin': { ends: 'manual', note: '+1 Evasion until an attack fails against you.', effects: () => [{ stat: 'evasion', value: 1 }] },

  // ---- Transformations.
  'tf:wolf-form': {
    ends: 'rest', cost: { stress: 1 }, stressOnHope: true,
    note: '+1d10 to attack and damage rolls. Rolling with Hope marks a Stress. Marking your last Stress sends you into a Howling Rampage.',
    attackDice: () => [{ count: 1, sides: 10 }],
    damageDice: () => [{ count: 1, sides: 10 }],
    effects: () => [],
  },
};

export function isActive(ch: Character, key: string): boolean {
  return (ch.active ?? []).includes(key);
}

export function activeOpts(ch: Character, key: string): string[] {
  return ch.activeOpts?.[key] ?? [];
}

/** Switch an effect on or off; switching on ends any other effect of its group (one stance at a time). */
export function setActive(ch: Character, key: string, on: boolean, opts?: string[]): Character {
  const group = ACTIVE[key]?.group;
  const list = (ch.active ?? []).filter((k) => k !== key && !(on && group && ACTIVE[k]?.group === group));
  const activeOptsNext = { ...(ch.activeOpts ?? {}) };
  if (on && opts) activeOptsNext[key] = opts;
  if (!on) delete activeOptsNext[key];
  return { ...ch, active: on ? [...list, key] : list, activeOpts: activeOptsNext };
}

function endWhere(ch: Character, ends: (d: ActiveDef) => boolean): Character {
  let c = ch;
  for (const k of ch.active ?? []) {
    const d = ACTIVE[k];
    if (!d || ends(d)) c = setActive(c, k, false);
  }
  return c;
}

/** End effects that last until a rest (and every effect that lasts a scene: a rest ends the scene). */
export function endActiveOnRest(ch: Character, kind: 'short' | 'long'): Character {
  return endWhere(ch, (d) => d.ends === 'rest' || d.ends === 'scene' || (kind === 'long' && d.ends === 'longRest'));
}

/** End effects that last until the end of the scene. */
export function endActiveOnScene(ch: Character): Character {
  return endWhere(ch, (d) => d.ends === 'scene');
}

/** End effects that last until the end of the session (scene effects end too). */
export function endActiveOnSession(ch: Character): Character {
  return endWhere(ch, (d) => d.ends === 'session' || d.ends === 'scene');
}
