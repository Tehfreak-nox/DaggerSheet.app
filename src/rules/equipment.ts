// Equip rules and attack profiles.
import { bloodstone, gemTrait, greatstone } from './items';
import { armorById, weaponById, type RangeId, type TraitId, type Weapon } from '../data';
import { derive, spellcastTraits, tierOf } from './derive';
import { versatileStats, type Modifier } from './effects';
import type { Character, WeaponSlot } from './model';

export type EquipProblem =
  | 'unknown' | 'wrong-slot' | 'tier-too-high' | 'needs-spellcast' | 'hands-full';

/** Why a weapon can't go in a slot, or [] if it can. */
export function weaponProblems(ch: Character, weaponId: string, slot: 'primary' | 'secondary'): EquipProblem[] {
  const w = weaponById.get(weaponId);
  if (!w) return ['unknown'];
  const out: EquipProblem[] = [];
  if (w.category !== slot) out.push('wrong-slot');
  if (w.tier > tierOf(ch.level)) out.push('tier-too-high');
  if (w.damage.type !== 'phy' && spellcastTraits(ch).length === 0) out.push('needs-spellcast');
  if (w.trait === 'spellcast' && spellcastTraits(ch).length === 0) out.push('needs-spellcast');
  const ignores = derive(ch).ignoresBurden;
  if (!ignores) {
    const other = slot === 'primary' ? ch.secondary : ch.primary;
    const otherW = other ? weaponById.get(other.id) : undefined;
    if (otherW && w.burden + otherW.burden > 2) out.push('hands-full');
  }
  return [...new Set(out)];
}

export function armorProblems(ch: Character, armorId: string): EquipProblem[] {
  const a = armorById.get(armorId);
  if (!a) return ['unknown'];
  return a.tier > tierOf(ch.level) ? ['tier-too-high'] : [];
}

/** Equip a weapon. A two-handed primary unequips the secondary (unless burden is ignored). */
export function equipWeapon(ch: Character, slot: 'primary' | 'secondary', weapon: WeaponSlot | undefined): Character {
  const next: Character = { ...ch, [slot]: weapon };
  if (!weapon) return next;
  const w = weaponById.get(weapon.id)!;
  if (!derive(ch).ignoresBurden && slot === 'primary' && w.burden === 2) next.secondary = undefined;
  if (!derive(ch).ignoresBurden && slot === 'secondary' && ch.primary && weaponById.get(ch.primary.id)!.burden === 2) {
    next.primary = undefined;
  }
  return next;
}

export interface AttackProfile {
  name: string;
  trait: TraitId;
  traitValue: number;
  range: RangeId | string;
  /** Attack roll modifiers besides the trait. */
  attackModifiers: { label: string; value: number }[];
  dice: { count: number; sides: number }[];
  damageBonus: number;
  damageType: Weapon['damage']['type'];
  /** Situational damage modifiers (Paired, Focused) – toggles, default on. */
  conditional: Modifier[];
  /** Feature text to show next to the weapon. */
  feature: Weapon['feature'];
  /** Massive / Powerful: roll an extra die and drop the lowest. */
  extraDieDropLowest: boolean;
  /** Brutal: a maximum damage die rolls another die. */
  brutal?: boolean;
}

export function attackProfile(ch: Character, slot: 'primary' | 'secondary'): AttackProfile | null {
  const d = derive(ch);
  if (slot === 'primary' && d.brawlersStrike) {
    // I Am the Weapon: trait of your choice (best), Melee, d8+d6 both scaling with Proficiency.
    const trait = (Object.entries(d.traits).sort((a, b) => b[1] - a[1])[0][0]) as TraitId;
    return {
      name: 'Brawler’s Strike', trait, traitValue: d.traits[trait], range: 'melee',
      attackModifiers: [], dice: [{ count: d.proficiency, sides: 8 }, { count: d.proficiency, sides: 6 }],
      damageBonus: d.modifiers.filter((m) => m.stat === 'damage' && !m.condition).reduce((a, m) => a + m.value, 0), damageType: 'phy', conditional: [], feature: null, extraDieDropLowest: false,
    };
  }
  const ws = ch[slot];
  if (!ws) return null;
  const w = weaponById.get(ws.id)!;
  const alt = ws.versatile ? versatileStats(w.feature) : null;
  let trait = (alt?.trait ?? w.trait) as TraitId | 'spellcast';
  if (trait === 'spellcast') {
    trait = d.spellcastTraits.slice().sort((a, b) => d.traits[b] - d.traits[a])[0];
  }
  // A gem attached to your primary weapon (Gem of Might: attack with Strength).
  const gem = slot === 'primary' ? gemTrait(ch) : null;
  if (gem) trait = gem;
  const die = alt?.damage.die ?? w.damage.die;
  let bonus = alt?.damage.bonus ?? w.damage.bonus;
  const attackModifiers: { label: string; value: number }[] = [];
  for (const m of d.modifiers) {
    if (m.stat !== 'attack' || m.condition) continue;
    const applies = m.appliesTo === 'all' || m.appliesTo === undefined
      || (m.appliesTo === 'primary' && slot === 'primary')
      || (m.appliesTo === 'own-weapon' && m.source === w.name);
    if (applies) attackModifiers.push({ label: m.source, value: m.value });
  }
  // Combat Training: + level to physical damage.
  if (d.ignoresBurden && w.damage.type !== 'mag') bonus += ch.level;
  // Damage bonuses from cards and lasting effects (Body Basher: Melee weapons only).
  const range = alt?.range ?? w.range;
  for (const m of d.modifiers) if (m.stat === 'damage' && !m.condition && (!m.meleeOnly || range === 'melee')) bonus += m.value;
  const conditional = slot === 'primary' ? d.conditional.filter((m) => m.stat === 'primaryDamage') : [];
  return {
    name: w.name,
    trait,
    traitValue: d.traits[trait],
    range: alt?.range ?? w.range,
    attackModifiers,
    dice: [{ count: d.proficiency, sides: die }],
    damageBonus: bonus,
    damageType: w.damage.type,
    conditional,
    feature: w.feature,
    // Greatstone gives a featureless primary weapon "Powerful".
    extraDieDropLowest: ['Massive', 'Powerful'].includes(w.feature?.name ?? '') || (slot === 'primary' && !w.feature && greatstone(ch)),
    // Bloodstone gives a featureless primary weapon "Brutal".
    brutal: w.feature?.name === 'Brutal' || (slot === 'primary' && !w.feature && !greatstone(ch) && bloodstone(ch)),
  };
}
