// Ranger (Beastbound) companion: its numbers from the companion sheet.
import { hasFeature } from './derive';
import type { Character, Companion } from './model';

/** Stress slots on the companion sheet (see FLAGS.md: the SRD text doesn't give the number). */
export const COMPANION_STRESS = 3;

export function newCompanion(): Companion {
  return { name: '', experiences: ['', ''], options: [], damageType: 'physical', stress: 0 };
}

export interface CompanionStats {
  evasion: number;
  stressSlots: number;
  damageDie: number;
  /** Experience modifiers, in order (+2; Intelligent adds +1 to the first). */
  experiences: { name: string; value: number }[];
  /** How many level-up options can be marked now. */
  optionsAllowed: number;
}

export function companionStats(ch: Character): CompanionStats {
  const c = ch.companion ?? newCompanion();
  const has = (id: string) => c.options.includes(id);
  // One option each level after 1; Expert Training one more, Advanced Training two more.
  const allowed = Math.max(0, ch.level - 1) + (hasFeature(ch, 'expert-training') ? 1 : 0) + (hasFeature(ch, 'advanced-training') ? 2 : 0);
  // "Whenever you gain a new Experience, your companion also gains one."
  const count = Math.max(2, ch.experiences.length);
  const names = Array.from({ length: count }, (_, i) => c.experiences[i] ?? '');
  return {
    evasion: 10 + (has('aware') ? 2 : 0),
    stressSlots: COMPANION_STRESS + (has('resilient') ? 1 : 0),
    damageDie: has('vicious') ? 8 : 6,
    experiences: names.map((name, i) => ({ name, value: 2 + (i === 0 && has('intelligent') ? 1 : 0) })),
    optionsAllowed: Math.min(8, allowed),
  };
}
