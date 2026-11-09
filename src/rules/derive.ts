// Derived character statistics. Everything shown on the sheet that isn't a
// player-entered value is computed here from the stored Character.
import {
  ancestryById, armorById, cardById, classById, rules, weaponById,
  type Beastform, type ClassDef, type DomainCard, type DomainId, type Feature, type Subclass, type TraitId, type Weapon,
} from '../data';
import { equipmentModifiers, type Modifier, type Stat } from './effects';
import { activeForm } from './forms';
import { ACTIVE, type ActiveCtx } from './active';
import { honingRelicExperience, itemModifiers } from './items';
import { transformationFeatureName, transformationModifiers } from './transformation';
import { TRAIT_IDS, type Character, type SubclassStage } from './model';

export const STAGES: SubclassStage[] = ['foundation', 'specialization', 'mastery'];

export function tierOf(level: number): 1 | 2 | 3 | 4 {
  return level <= 1 ? 1 : level <= 4 ? 2 : level <= 7 ? 3 : 4;
}

export function classOf(ch: Character): ClassDef {
  const c = classById.get(ch.classId);
  if (!c) throw new Error(`Unknown class ${ch.classId}`);
  return c;
}

export function subclassOf(ch: Character): Subclass {
  const s = classOf(ch).subclasses.find((x) => x.id === ch.subclassId);
  if (!s) throw new Error(`Unknown subclass ${ch.subclassId} for ${ch.classId}`);
  return s;
}

export function multiclassSubclass(ch: Character): Subclass | null {
  if (!ch.multiclass) return null;
  return classById.get(ch.multiclass.classId)!.subclasses.find((s) => s.id === ch.multiclass!.subclassId) ?? null;
}

/** The two ancestry features in effect (mixed ancestry: first of one, second of another). */
export function ancestryFeatures(ch: Character): [Feature, Feature] {
  if ('id' in ch.ancestry) {
    const a = ancestryById.get(ch.ancestry.id);
    if (!a) throw new Error(`Unknown ancestry ${ch.ancestry.id}`);
    return a.features;
  }
  const first = ancestryById.get(ch.ancestry.mixed.first);
  const second = ancestryById.get(ch.ancestry.mixed.second);
  if (!first || !second) throw new Error('Unknown mixed ancestry');
  return [first.features[0], second.features[1]];
}

/**
 * The ancestry features that work: both, or only the one chosen for a Shapeshifter
 * ("Only Skin Deep: You gain the benefit of only one of your chosen ancestry's features").
 */
export function workingAncestryFeatures(ch: Character): Feature[] {
  const both = ancestryFeatures(ch);
  if (ch.transformation !== 'shapeshifter') return both;
  return [both.find((f) => f.id === ch.picks.shapeshifter) ?? both[0]];
}

/** Subclass features you have, in order, with their stage. */
export function subclassFeatures(ch: Character): { stage: SubclassStage; feature: Feature; subclass: Subclass }[] {
  const s = subclassOf(ch);
  const upTo = STAGES.indexOf(ch.subclassStage);
  const out = STAGES.slice(0, upTo + 1).flatMap((stage) => s[stage].map((feature) => ({ stage, feature, subclass: s })));
  const mc = multiclassSubclass(ch);
  if (mc) out.push(...mc.foundation.map((feature) => ({ stage: 'foundation' as const, feature, subclass: mc })));
  return out;
}

export function spellcastTraits(ch: Character): TraitId[] {
  const out = [subclassOf(ch).spellcastTrait, multiclassSubclass(ch)?.spellcastTrait]
    .filter((t): t is TraitId => !!t);
  return [...new Set(out)];
}

export function ownedCards(ch: Character): DomainCard[] {
  return [...ch.cards.loadout, ...ch.cards.vault].map((id) => {
    const c = cardById.get(id);
    if (!c) throw new Error(`Unknown card ${id}`);
    return c;
  });
}

export function accessibleDomains(ch: Character): DomainId[] {
  const out = [...classOf(ch).domains];
  if (ch.multiclass) out.push(ch.multiclass.domain);
  return out;
}

export function equippedWeapons(ch: Character): { slot: 'primary' | 'secondary'; weapon: Weapon }[] {
  const out: { slot: 'primary' | 'secondary'; weapon: Weapon }[] = [];
  for (const slot of ['primary', 'secondary'] as const) {
    const w = ch[slot];
    if (w) {
      const weapon = weaponById.get(w.id);
      if (!weapon) throw new Error(`Unknown weapon ${w.id}`);
      out.push({ slot, weapon });
    }
  }
  return out;
}

/** The Beastform the character is in, if any (Druid, or a Druid multiclass). */
export function beastformOf(ch: Character): Beastform | undefined {
  return activeForm(ch)?.form;
}

export interface Derived {
  tier: 1 | 2 | 3 | 4;
  traits: Record<TraitId, number>;
  /** Base trait plus permanent advancements, before equipment and features. */
  baseTraits: Record<TraitId, number>;
  evasion: number;
  armorScore: number;
  thresholds: { major: number; severe: number };
  hitPoints: number;
  stressSlots: number;
  hopeSlots: number;
  proficiency: number;
  spellcastTraits: TraitId[];
  /** Best Spellcast trait value, or null if the character has none. */
  spellcast: number | null;
  experiences: { name: string; value: number }[];
  /** Situational modifiers (e.g. Paired) the attack UI shows as toggles. */
  conditional: Modifier[];
  attackBonus: number;
  /** Added to every action and reaction roll. */
  actionBonus: number;
  spellcastBonus: number;
  modifiers: Modifier[];
  /** Brawler with no other active weapons uses Brawler’s Strike. */
  brawlersStrike: boolean;
  ignoresBurden: boolean;
}

const count = (ch: Character, id: string) => ch.advancements.filter((a) => a.choice.id === id).length;

export function proficiencyOf(ch: Character): number {
  const achievements = rules.leveling.achievements.filter((a) => ch.level >= a.level).length;
  return 1 + achievements + count(ch, 'proficiency');
}

/** Base traits plus "+1 to two traits" advancements. */
export function baseTraits(ch: Character): Record<TraitId, number> {
  const t = { ...ch.traits };
  for (const a of ch.advancements) if (a.choice.id === 'traits') for (const id of a.choice.traits) t[id] += 1;
  return t;
}

export function experienceValues(ch: Character): number[] {
  const base = rules.creation.experiences.modifier;
  const vals = ch.experiences.map(() => base);
  for (const a of ch.advancements) if (a.choice.id === 'experiences') for (const i of a.choice.experiences) vals[i] += 1;
  if (ch.purposefulDesign !== undefined && hasAncestryFeature(ch, 'purposeful-design')) vals[ch.purposefulDesign] += 1;
  const honing = honingRelicExperience(ch);
  if (honing !== null) vals[honing] += 1;
  const mc = ch.picks.masterOfTheCraft;
  if (mc && ownedCards(ch).some((c) => c.id === 'grace-master-of-the-craft')) {
    const bonus = mc.experiences.length === 1 ? 3 : 2;
    for (const i of mc.experiences) vals[i] += bonus;
  }
  return vals;
}

/** A class or subclass feature you have, by id (multiclass included). */
export function hasFeature(ch: Character, featureId: string): boolean {
  const cls = classOf(ch);
  if (cls.features.some((f) => f.id === featureId) || cls.hopeFeature.id === featureId) return true;
  if (ch.multiclass && classById.get(ch.multiclass.classId)?.features.some((f) => f.id === featureId)) return true;
  return subclassFeatures(ch).some((x) => x.feature.id === featureId);
}

/** What an effect's numbers are worked out from. */
export function activeCtx(ch: Character, key: string, traits: Record<TraitId, number> = baseTraits(ch)): ActiveCtx {
  const sp = spellcastTraits(ch);
  return {
    traits,
    spellcast: sp.length ? Math.max(...sp.map((x) => traits[x])) : null,
    proficiency: Math.min(rules.caps.proficiency, proficiencyOf(ch)),
    tier: tierOf(ch.level),
    level: ch.level,
    opts: ch.activeOpts?.[key] ?? [],
    has: (id) => hasFeature(ch, id),
  };
}

/** The name shown for a lasting effect's modifiers. */
export function activeName(ch: Character, key: string): string {
  const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  if (kind === 'card') return cardById.get(id)?.name ?? id;
  if (kind === 'hope') return classOf(ch).hopeFeature.name;
  if (kind === 'stance') return `${id.charAt(0).toUpperCase() + id.slice(1)} stance`;
  if (kind === 'tf') return transformationFeatureName(id);
  const f = subclassFeatures(ch).find((x) => x.feature.id === id)?.feature ?? classOf(ch).features.find((x) => x.id === id);
  return f?.name ?? id;
}

export function hasAncestryFeature(ch: Character, featureId: string): boolean {
  return workingAncestryFeatures(ch).some((f) => f.id === featureId);
}

/** Effects from ancestry, subclass and class features, keyed by feature id. */
type Ctx = { ch: Character; proficiency: number; traits: Record<TraitId, number>; armored: boolean };
const FEATURE_EFFECTS: Record<string, (ctx: Ctx) => Omit<Modifier, 'source'>[]> = {
  // Ancestry
  'stoneskin': () => [{ stat: 'armorScore', value: 1 }, { stat: 'major', value: 1 }, { stat: 'severe', value: 1 }],
  'endurance': () => [{ stat: 'hitPoints', value: 1 }],
  'high-stamina': () => [{ stat: 'stress', value: 1 }],
  'nimble': () => [{ stat: 'evasion', value: 1 }],
  'shell': ({ proficiency }) => [{ stat: 'major', value: proficiency }, { stat: 'severe', value: proficiency }],
  // Subclasses
  'rugged': () => [{ stat: 'severe', value: 3 }],
  'unwavering': () => [{ stat: 'major', value: 1 }, { stat: 'severe', value: 1 }],
  'unrelenting': () => [{ stat: 'major', value: 2 }, { stat: 'severe', value: 2 }],
  'undaunted': () => [{ stat: 'major', value: 3 }, { stat: 'severe', value: 3 }],
  'at-ease': () => [{ stat: 'stress', value: 1 }],
  'fleeting-shadow': () => [{ stat: 'evasion', value: 1 }],
  'ascendant': () => [{ stat: 'severe', value: 4 }],
  'battlemage': () => [{ stat: 'hitPoints', value: 1 }],
};

/** Passive domain cards: apply while in the loadout. */
const CARD_EFFECTS: Record<string, (ctx: Ctx) => Omit<Modifier, 'source'>[]> = {
  'blade-fortified-armor': ({ armored }) => armored ? [{ stat: 'major', value: 2 }, { stat: 'severe', value: 2 }] : [],
  'valor-armorer': ({ armored }) => armored ? [{ stat: 'armorScore', value: 1 }] : [],
  // "half your Agility", rounded up (SRD: round up unless specified); no bonus from a negative Agility.
  'bone-untouchable': ({ traits }) => [{ stat: 'evasion', value: Math.max(0, Math.ceil(traits.agility / 2)) }],
  'valor-rise-up': ({ proficiency }) => [{ stat: 'severe', value: proficiency }],
  'dread-eldritch-flesh': ({ ch }) => [{ stat: 'major', value: ch.stress }, { stat: 'severe', value: ch.stress }],
  // "On a successful attack using a weapon with a Melee range, gain a bonus to your damage roll equal to your Strength."
  'valor-body-basher': ({ traits }) => [{ stat: 'damage', value: traits.strength, meleeOnly: true }],
  // "gain a bonus to your damage roll equal to either your Finesse or Agility": the higher one.
  'bone-cruel-precision': ({ traits }) => [{ stat: 'damage', value: Math.max(traits.finesse, traits.agility) }],
};

/** Bare Bones: unarmored base Armor Score 3 + Strength and these base thresholds by tier. */
const BARE_BONES: Record<1 | 2 | 3 | 4, [number, number]> = { 1: [9, 19], 2: [11, 24], 3: [13, 31], 4: [15, 38] };

/** "<Domain>-Touched": active with 4+ cards of that domain in the loadout. */
const TOUCHED: Partial<Record<DomainId, Omit<Modifier, 'source'>[]>> = {
  arcana: [{ stat: 'spellcast', value: 1 }],
  blade: [{ stat: 'attack', value: 2 }, { stat: 'severe', value: 4 }],
  bone: [{ stat: 'agility', value: 1 }],
  splendor: [{ stat: 'severe', value: 3 }],
  valor: [{ stat: 'armorScore', value: 1 }],
};

export function featureEffectIds(): string[] {
  return Object.keys(FEATURE_EFFECTS);
}
export function cardEffectIds(): string[] {
  return Object.keys(CARD_EFFECTS);
}

export function derive(ch: Character): Derived {
  const cls = classOf(ch);
  const tier = tierOf(ch.level);
  const proficiency = Math.min(rules.caps.proficiency, proficiencyOf(ch));
  const base = baseTraits(ch);
  const armor = ch.armorId ? armorById.get(ch.armorId) : undefined;
  if (ch.armorId && !armor) throw new Error(`Unknown armor ${ch.armorId}`);
  const weapons = equippedWeapons(ch);
  const mods: Modifier[] = [];

  // Equipment
  for (const { weapon } of weapons) mods.push(...(equipmentModifiers(weapon.feature, weapon.name) ?? []));
  if (armor) mods.push(...(equipmentModifiers(armor.feature, armor.name) ?? []));

  // Traits including equipment changes are needed by some feature effects.
  const sumTraits = (ms: Modifier[]) => {
    const t = { ...base };
    for (const m of ms) if ((TRAIT_IDS as string[]).includes(m.stat) && !m.condition) t[m.stat as TraitId] += m.value;
    return t;
  };
  const ctx: Ctx = { ch, proficiency, traits: sumTraits(mods), armored: !!armor };

  // Ancestry and subclass features
  const feats: Feature[] = [...workingAncestryFeatures(ch), ...subclassFeatures(ch).map((x) => x.feature)];
  for (const f of feats) {
    const fx = FEATURE_EFFECTS[f.id];
    if (fx) mods.push(...fx(ctx).map((m) => ({ ...m, source: f.name })));
  }

  // Domain cards in the loadout
  const loadout = ch.cards.loadout.map((id) => cardById.get(id)!);
  for (const c of loadout) {
    const fx = CARD_EFFECTS[c.id];
    if (fx) mods.push(...fx(ctx).map((m) => ({ ...m, source: c.name })));
    const touched = /-touched$/.test(c.id) ? TOUCHED[c.domain] : undefined;
    if (touched && loadout.filter((x) => x.domain === c.domain).length >= 4) {
      mods.push(...touched.map((m) => ({ ...m, source: c.name })));
    }
  }

  // Vitality: permanent picks, card sits in the vault.
  if (ownedCards(ch).some((c) => c.id === 'blade-vitality')) {
    for (const p of ch.picks.vitality ?? []) {
      if (p === 'thresholds') mods.push({ stat: 'major', value: 2, source: 'Vitality' }, { stat: 'severe', value: 2, source: 'Vitality' });
      else mods.push({ stat: p === 'stress' ? 'stress' : 'hitPoints', value: 1, source: 'Vitality' });
    }
  }

  // Armor features based on another stat.
  const spellTraits = spellcastTraits(ch);
  const traitsNow = sumTraits(mods);
  const spellcast = spellTraits.length ? Math.max(...spellTraits.map((t) => traitsNow[t])) : null;
  if (armor?.feature?.name === 'Enchanted' && spellcast !== null && spellcast > 0) {
    mods.push({ stat: 'major', value: spellcast, source: armor.name }, { stat: 'severe', value: spellcast, source: armor.name });
  }
  if (armor?.feature?.name === 'Magnificent' && traitsNow.presence > 0) {
    mods.push({ stat: 'armorScore', value: traitsNow.presence, source: armor.name });
  }

  // Lasting effects that are switched on.
  for (const key of ch.active ?? []) {
    const def = ACTIVE[key];
    if (!def) continue;
    mods.push(...def.effects(activeCtx(ch, key, sumTraits(mods))).map((m) => ({ ...m, source: activeName(ch, key) })));
  }

  // Features that work on their own once their condition holds.
  const has = (id: string) => hasFeature(ch, id);
  // Conjure Shield: "While you have at least 2 Hope, you add your Proficiency to your Evasion."
  if (has('conjure-shield') && ch.hope >= 2) mods.push({ stat: 'evasion', value: proficiency, source: 'Conjure Shield' });
  // Lunar Phases: the die on the card picks the effect until the end of the session.
  const phase = ch.uses['session:phase:sub:lunar-phases'];
  if (has('lunar-phases') && phase) {
    if (phase === 2 || phase === 3) mods.push({ stat: 'damage', value: 2, source: 'Waxing Moon' });
    if (phase === 4) mods.push({ stat: 'major', value: 3, source: 'Full Moon' }, { stat: 'severe', value: 3, source: 'Full Moon' });
    if (phase >= 5) mods.push({ stat: 'evasion', value: 1, source: 'Waning Moon' });
  }
  mods.push(...transformationModifiers(ch), ...itemModifiers(ch));

  // Brawler: Brawler’s Strike while no other active weapons, +1 Evasion.
  const brawlersStrike = cls.id === 'brawler' && weapons.length === 0;
  if (brawlersStrike) mods.push({ stat: 'evasion', value: 1, source: 'I Am the Weapon' });

  // Beastform: the form's trait and Evasion bonuses; Evolution raises one more trait by +1.
  const form = activeForm(ch);
  if (form) {
    if (form.trait && form.traitBonus) mods.push({ stat: form.trait, value: form.traitBonus, source: form.name });
    if (form.evasionBonus) mods.push({ stat: 'evasion', value: form.evasionBonus, source: form.name });
    if (form.thresholdBonus) mods.push({ stat: 'major', value: form.thresholdBonus, source: form.name }, { stat: 'severe', value: form.thresholdBonus, source: form.name });
    if (ch.beastform?.evolution) mods.push({ stat: ch.beastform.evolution, value: 1, source: 'Evolution' });
  }

  const always = mods.filter((m) => !m.condition);
  const sum = (stat: Stat) => always.filter((m) => m.stat === stat).reduce((a, m) => a + m.value, 0);
  const traits = sumTraits(mods);

  const evasion = cls.startingEvasion + count(ch, 'evasion') + sum('evasion');
  const bareBones = !armor && ch.cards.loadout.includes('valor-bare-bones');
  const armorScore = Math.max(0, Math.min(rules.caps.armorScore, (armor?.score ?? (bareBones ? 3 + traits.strength : 0)) + sum('armorScore')));
  const baseMajor = armor ? armor.thresholds.major : bareBones ? BARE_BONES[tier][0] : 0;
  const baseSevere = armor ? armor.thresholds.severe : bareBones ? BARE_BONES[tier][1] : ch.level; // unarmored: Severe = 2 × level
  const thresholds = {
    major: baseMajor + ch.level + sum('major'),
    severe: baseSevere + ch.level + sum('severe'),
  };
  const hitPoints = Math.max(1, Math.min(rules.caps.hitPointSlots, cls.startingHitPoints + count(ch, 'hitPoint') + sum('hitPoints')));
  const stressSlots = Math.min(rules.caps.stressSlots, rules.creation.stress + count(ch, 'stress') + sum('stress'));
  const exp = experienceValues(ch);

  return {
    tier,
    traits,
    baseTraits: base,
    evasion,
    armorScore,
    thresholds,
    hitPoints,
    stressSlots,
    // Companion "Light in the Dark": an additional Hope slot.
    hopeSlots: Math.max(0, rules.caps.hope - (ch.scars ?? 0) + (ch.companion?.options.includes('light-in-the-dark') && hasFeature(ch, 'companion') ? 1 : 0)),
    proficiency: Math.max(1, Math.min(rules.caps.proficiency, proficiency + sum('proficiency'))),
    spellcastTraits: spellTraits,
    spellcast,
    experiences: ch.experiences.map((e, i) => ({ name: e.name, value: exp[i] })),
    conditional: mods.filter((m) => m.condition),
    attackBonus: sum('attack'),
    actionBonus: sum('action'),
    spellcastBonus: sum('spellcast'),
    modifiers: mods,
    brawlersStrike,
    // Combat Training (Warrior). Multiclass "gain its class feature" is ambiguous for two-feature classes: see FLAGS.md.
    ignoresBurden: cls.id === 'warrior',
  };
}
