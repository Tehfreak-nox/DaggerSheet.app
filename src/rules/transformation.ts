// Transformations (SRD pp. 42–45): an optional card added to your heritage.
// Their numbers apply on their own; what needs the GM stays as a reminder.
import { transformationById, type Feature } from '../data';
import type { Modifier } from './effects';
import type { Character } from './model';

export function transformationOf(ch: Character) {
  return ch.transformation ? transformationById.get(ch.transformation) : undefined;
}

export function transformationFeatures(ch: Character): Feature[] {
  return transformationOf(ch)?.features ?? [];
}

export function transformationFeatureName(featureId: string): string {
  for (const id of ['demigod', 'ghost', 'reanimated', 'shapeshifter', 'vampire', 'werewolf']) {
    const f = transformationById.get(id)?.features.find((x) => x.id === featureId);
    if (f) return f.name;
  }
  return featureId;
}

/** Demigod "Gifted": +1 to action, reaction and damage rolls. */
export function transformationModifiers(ch: Character): Modifier[] {
  if (ch.transformation === 'demigod') {
    return [{ stat: 'action', value: 1, source: 'Gifted' }, { stat: 'damage', value: 1, source: 'Gifted' }];
  }
  return [];
}

/** Vampire "Feed": tokens held on the card (up to 6). */
export const FEED_KEY = 'tokens:tf:feed';

/** Vampire with no Feed tokens: "you make action and reaction rolls with disadvantage." */
export function starving(ch: Character): boolean {
  return ch.transformation === 'vampire' && (ch.uses[FEED_KEY] ?? 0) <= 0;
}
