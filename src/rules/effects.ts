// Passive (always-on or toggle) stat effects from equipment, ancestry,
// subclass features and domain cards. Situational effects that need a
// decision at the table are handled by the feature UI, not here.
import type { ItemFeature, TraitId } from '../data';

export type Stat =
  | TraitId
  | 'evasion' | 'armorScore' | 'major' | 'severe' | 'hitPoints' | 'stress'
  | 'attack' | 'spellcast' | 'primaryDamage' | 'proficiency'
  /** Every action and reaction roll (Demigod "Gifted", Lunar effects). */
  | 'action'
  /** Weapon damage rolls (meleeOnly: weapons with Melee range). */
  | 'damage';

export interface Modifier {
  stat: Stat;
  value: number;
  source: string;
  /** Applies only in a situation (e.g. "targets within Melee range"); shown as a toggle, default on. */
  condition?: string;
  /** Attack modifiers: only for the weapon that has the feature, only the primary weapon, or every attack. */
  appliesTo?: 'own-weapon' | 'primary' | 'all';
  meleeOnly?: boolean;
}

const TRAIT_NAMES: Record<string, TraitId> = {
  Agility: 'agility', Strength: 'strength', Finesse: 'finesse',
  Instinct: 'instinct', Presence: 'presence', Knowledge: 'knowledge',
};

const num = (s: string) => Number(s.replace('−', '-'));

/**
 * Parse the stat part of a weapon or armor feature ("−1 to Evasion; −1 to Agility").
 * Returns null when the feature has no fixed stat effect (it's rules text).
 */
export function equipmentModifiers(feature: ItemFeature | null, source: string): Modifier[] | null {
  if (!feature) return [];
  const text = feature.text.trim().replace(/\.$/, '');
  if (!/^[+−-]\d/.test(text)) return null;
  const out: Modifier[] = [];
  for (const raw of text.split(';')) {
    const part = raw.trim();
    let m: RegExpExecArray | null;
    if ((m = /^([+−-]\d+) (?:to )?Evasion$/.exec(part))) {
      out.push({ stat: 'evasion', value: num(m[1]), source });
    } else if ((m = /^([+−-]\d+) to all character traits and Evasion$/.exec(part))) {
      for (const t of Object.values(TRAIT_NAMES)) out.push({ stat: t, value: num(m[1]), source });
      out.push({ stat: 'evasion', value: num(m[1]), source });
    } else if ((m = /^([+−-]\d+) to (Agility|Strength|Finesse|Instinct|Presence|Knowledge)$/.exec(part))) {
      out.push({ stat: TRAIT_NAMES[m[2]], value: num(m[1]), source });
    } else if ((m = /^([+−-]\d+) to (?:your )?Armor Score$/.exec(part))) {
      out.push({ stat: 'armorScore', value: num(m[1]), source });
    } else if ((m = /^([+−-]\d+) to damage thresholds$/.exec(part))) {
      out.push({ stat: 'major', value: num(m[1]), source }, { stat: 'severe', value: num(m[1]), source });
    } else if ((m = /^([+−-]\d+) to Severe damage threshold$/.exec(part))) {
      out.push({ stat: 'severe', value: num(m[1]), source });
    } else if ((m = /^([+−-]\d+) to attack rolls( made with your primary weapon)?$/.exec(part))) {
      out.push({ stat: 'attack', value: num(m[1]), source, appliesTo: m[2] ? 'primary' : 'own-weapon' });
    } else if ((m = /^([+−-]\d+) to Spellcast Rolls$/.exec(part))) {
      out.push({ stat: 'spellcast', value: num(m[1]), source });
    } else if ((m = /^([+−-]\d+) to primary weapon damage (?:to targets )?within (Melee|Very Close) range$/.exec(part))) {
      out.push({ stat: 'primaryDamage', value: num(m[1]), source, condition: `Target within ${m[2]} range` });
    } else if (!/^[+−-]\d/.test(part)) {
      // Rules text after the stat clauses ("on a successful attack, …"): shown, not modelled.
      continue;
    } else {
      throw new Error(`Unparsed equipment feature clause "${part}" (${source})`);
    }
  }
  return out;
}

export interface VersatileStats {
  trait: TraitId;
  range: string;
  damage: { die: number; bonus: number };
}

/** "Versatile: This weapon can also be used with these statistics—Finesse, Melee, d10+3." */
export function versatileStats(feature: ItemFeature | null): VersatileStats | null {
  if (!feature || feature.name !== 'Versatile') return null;
  const m = /statistics—(\w+), (Melee|Very Close|Close|Far|Very Far), d(\d+)(?:\+(\d+))?/.exec(feature.text);
  if (!m) throw new Error(`Unparsed Versatile feature: ${feature.text}`);
  return {
    trait: TRAIT_NAMES[m[1]],
    range: m[2].toLowerCase().replace(' ', '-'),
    damage: { die: Number(m[3]), bonus: Number(m[4] ?? 0) },
  };
}
