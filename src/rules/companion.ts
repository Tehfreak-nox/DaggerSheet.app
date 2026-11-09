// Ranger (Beastbound) companion, as on the Ranger Companion sheet: Evasion 10,
// 3 Stress, a d6 Melee standard attack, two Experiences at +2, and one training
// option each time your character levels up.
import { hasFeature, STAGES } from './derive';
import type { Character, Companion, CompanionPick, SubclassStage } from './model';

/** Stress boxes printed solid on the sheet (3 more dashed ones come from Resilient). */
export const COMPANION_STRESS = 3;

/** How many times each training option can be marked (boxes on the sheet). */
export const TRAINING_MAX: Record<string, number> = {
  intelligent: 3, 'light-in-the-dark': 1, 'creature-comfort': 1, armored: 1, vicious: 3, resilient: 3, bonded: 1, aware: 3,
};

export const COMPANION_DICE = [6, 8, 10, 12];
export const COMPANION_RANGES = ['Melee', 'Very Close', 'Close', 'Far', 'Very Far'];

export const EXAMPLE_EXPERIENCES = ['Bold Distraction', 'Expert Climber', 'Fetch', 'Friendly', 'Guardian of the Forest', 'Horrifying', 'Intimidating',
  'Loyal Until the End', 'Navigation', 'Nimble', 'Nobody Left Behind', 'On High Alert', 'Protective', 'Royal Companion', 'Scout',
  'Service Animal', 'Trusted Mount', 'Vigilant', 'We Always Find Them', 'You Can’t Hit What You Can’t Find'];

export function newCompanion(): Companion {
  return { name: '', species: '', attack: '', experiences: ['', ''], picks: [], damageType: 'physical', stress: 0 };
}

/** The training picks, including those saved before picks were kept by level. */
export function companionPicks(c: Companion): CompanionPick[] {
  return c.picks ?? (c.options ?? []).map((option) => ({ option, level: 0 }));
}

export interface CompanionStats {
  evasion: number;
  stressSlots: number;
  damageDie: number;
  range: string;
  /** Experiences in order: +2 each, +1 per Intelligent aimed at it. */
  experiences: { name: string; value: number }[];
  /** Training picks allowed so far. */
  allowed: number;
  count: (option: string) => number;
}

/** Training picks a character of this level and subclass stage gets: one each level after 1, Expert Training +1, Advanced Training +2. */
export function trainingAllowed(ch: Character, level = ch.level, stage: SubclassStage = ch.subclassStage): number {
  const own = ch.subclassId === 'beastbound';
  const at = (s: SubclassStage) => own && STAGES.indexOf(stage) >= STAGES.indexOf(s);
  return Math.max(0, level - 1) + (at('specialization') ? 1 : 0) + (at('mastery') ? 2 : 0);
}

export function companionStats(ch: Character): CompanionStats {
  const c = ch.companion ?? newCompanion();
  const picks = companionPicks(c);
  const count = (o: string) => picks.filter((p) => p.option === o).length;
  const vicious = picks.filter((p) => p.option === 'vicious');
  const dieSteps = vicious.filter((p) => p.vicious !== 'range').length;
  const rangeSteps = vicious.filter((p) => p.vicious === 'range').length;
  // "Whenever you gain a new Experience, your companion also gains one."
  const n = Math.max(2, ch.experiences.length);
  const names = Array.from({ length: n }, (_, i) => c.experiences[i] ?? '');
  return {
    evasion: 10 + 2 * count('aware'),
    stressSlots: COMPANION_STRESS + count('resilient'),
    damageDie: COMPANION_DICE[Math.min(3, dieSteps)],
    range: COMPANION_RANGES[Math.min(4, rangeSteps)],
    experiences: names.map((name, i) => ({ name, value: 2 + picks.filter((p) => p.option === 'intelligent' && (p.experience ?? 0) === i).length })),
    allowed: trainingAllowed(ch),
    count,
  };
}

export function hasCompanion(ch: Character): boolean {
  return hasFeature(ch, 'companion');
}
