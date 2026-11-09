// Downtime: short and long rests (SRD "Downtime").
import { endActiveOnRest, endActiveOnScene, endActiveOnSession, setActive } from './active';
import { carries } from './items';
import { COMPANION_STRESS } from './companion';
import { FEED_KEY } from './transformation';
import { rules } from '../data';
import { derive, hasAncestryFeature, hasFeature } from './derive';
import { defaultRng, roll, rollMany, type Rng } from './dice';
import type { Character } from './model';
import { controlsFor, type TokenSource } from './mechanics';
import { inEffect } from './inEffect';

/** How many tokens a card's "place a number of tokens equal to …" gives, or null when it's counted by hand. */
export function tokenCount(ch: Character, source: TokenSource): number | null {
  const d = derive(ch);
  if ('fixed' in source) return source.fixed;
  if ('trait' in source) {
    const v = source.trait === 'spellcast' ? (d.spellcast ?? 0) : d.traits[source.trait];
    return Math.max(source.min ?? 0, v);
  }
  if ('stat' in source) return source.stat === 'tier' ? d.tier : source.stat === 'proficiency' ? d.proficiency : ch.level;
  return null;
}

/**
 * Card tokens at a rest: "When you take a (long) rest, clear all unspent tokens",
 * then "After a long rest, place a number of tokens equal to …" refills them.
 */
function restTokens(ch: Character, kind: RestKind): Character {
  const uses = { ...ch.uses };
  for (const e of inEffect(ch)) {
    const t = e.text.replace(/\*\*/g, '');
    const key = `tokens:${e.key}`;
    const clears = kind === 'long' ? /When you take a (long )?rest, clear all unspent tokens/i.test(t) : /When you take a rest, clear all unspent tokens/i.test(t);
    if (clears || (/Clear all tokens from this card when you take a rest/i.test(t))) uses[key] = 0;
    if (kind === 'long' && /After a long rest, place/i.test(t)) {
      const tok = controlsFor(e.text).find((c) => c.kind === 'tokens');
      const n = tok && tok.kind === 'tokens' ? tokenCount(ch, tok.source) : null;
      if (n !== null) uses[key] = n;
    }
  }
  return { ...ch, uses };
}

/**
 * Start a new session: per-session and per-scene uses refresh, and pooled dice
 * clear ("At the end of each session, clear any unspent Slayer Dice … and gain a
 * Hope per die cleared").
 */
export function newSession(ch: Character, rng: Rng = defaultRng): Character {
  let hope = ch.hope;
  for (const e of inEffect(ch)) {
    const pool = controlsFor(e.text).find((c) => c.kind === 'dicePool');
    const n = ch.uses[`pool:${e.key}`] ?? 0;
    if (pool && pool.kind === 'dicePool' && pool.hopeAtSessionEnd) hope += n;
  }
  const uses = Object.fromEntries(Object.entries(ch.uses).filter(([k]) => !k.startsWith('session:') && !k.startsWith('scene:') && !k.startsWith('pool:')));
  // "At the end of each session, clear all unspent tokens" (Know the Tide).
  for (const e of inEffect(ch)) if (/At the end of each session, clear all unspent tokens/i.test(e.text)) delete uses[`tokens:${e.key}`];
  let c: Character = endActiveOnSession({ ...ch, hope: Math.min(derive(ch).hopeSlots, hope), uses });
  const d = derive(c);
  // Seraph: "At the beginning of each session, roll a number of d4s equal to your subclass's Spellcast trait" (Devout: one more, drop the lowest).
  const held = { ...(c.heldDice ?? {}) };
  delete held.prayer;
  if (hasFeature(c, 'prayer-dice')) {
    const n = Math.max(0, d.spellcast ?? 0);
    const devout = hasFeature(c, 'devout');
    const values = rollMany(n + (devout && n ? 1 : 0), 4, rng).sort((a, b) => b - a).slice(0, n);
    if (n) held.prayer = values;
  }
  c = { ...c, heldDice: held };
  // Lunar Phases: "At the beginning of each session, roll a d6 and place it on this card."
  if (hasFeature(c, 'lunar-phases')) c = { ...c, uses: { ...c.uses, 'session:phase:sub:lunar-phases': roll(6, rng) } };
  // Halfling "Luckbringer": "At the start of each session, everyone in your party gains a Hope."
  if (hasAncestryFeature(c, 'luckbringer')) c = { ...c, hope: Math.min(d.hopeSlots, c.hope + 1) };
  return c;
}

/** End the scene: per-scene uses refresh, scene effects (stances, Patron's Mantle) and the Unstoppable Die end. */
export function endScene(ch: Character): Character {
  const uses = Object.fromEntries(Object.entries(ch.uses).filter(([k]) => !k.startsWith('scene:') && !/^die:.*:(class|mc):unstoppable$/.test(k)));
  return endActiveOnScene({ ...ch, uses });
}

export type RestKind = 'short' | 'long';

export interface RestMove {
  id: string;
  /** Prepare with one or more party members: 2 Hope instead of 1. */
  withParty?: boolean;
}

export interface RestLogEntry {
  move: string;
  roll?: { die: number; tier: number; total: number };
  effect: string;
}

/** Uses counters are keyed "<per>:<feature>"; rests clear the matching ones. */
export const USE_SCOPES = { rest: 'rest:', longRest: 'longRest:', session: 'session:', scene: 'scene:' } as const;

export interface RestOptions {
  /** Elf "Celestial Trance" is optional ("you can drop into a trance"). Default true. */
  trance?: boolean;
}

export function moveLimit(ch: Character, opts: RestOptions = {}): number {
  // Elf "Celestial Trance": choose an additional downtime move during a rest.
  const trance = opts.trance !== false && hasAncestryFeature(ch, 'celestial-trance');
  // Timekeeper's Pendant: "You can choose an additional downtime move each rest."
  return rules.downtime.movesPerRest + (trance ? 1 : 0) + (carries(ch, 'timekeepers-pendant') ? 1 : 0);
}

export function mustLongRest(ch: Character): boolean {
  return ch.shortRestStreak >= rules.downtime.shortRestsBeforeLong;
}

export function restProblems(ch: Character, kind: RestKind, moves: RestMove[], opts: RestOptions = {}): string[] {
  const p: string[] = [];
  if (kind === 'short' && mustLongRest(ch)) p.push('After three short rests in a row, the next rest must be a long rest.');
  if (moves.length > moveLimit(ch, opts)) p.push(`Choose up to ${moveLimit(ch, opts)} downtime moves.`);
  const short = rules.downtime.short.moves.map((m) => m.id);
  const long = rules.downtime.long.moves.map((m) => m.id);
  let longInShort = 0;
  for (const m of moves) {
    if (kind === 'long' && !long.includes(m.id)) p.push(`"${m.id}" is not a long rest move.`);
    if (kind === 'short' && !short.includes(m.id)) {
      // Clank "Efficient": on a short rest you can choose a long rest move instead of a short rest move.
      if (long.includes(m.id) && hasAncestryFeature(ch, 'efficient')) longInShort++;
      else p.push(`"${m.id}" is not a short rest move.`);
    }
  }
  if (longInShort > 1) p.push('Efficient lets you swap in one long rest move.');
  return p;
}

export function rest(
  ch: Character, kind: RestKind, moves: RestMove[], rng: Rng = defaultRng, opts: RestOptions = {},
): { character: Character; log: RestLogEntry[] } {
  const problems = restProblems(ch, kind, moves, opts);
  if (problems.length) throw new Error(problems.join(' '));
  const d = derive(ch);
  let c: Character = { ...ch };
  const log: RestLogEntry[] = [];
  // Duneborne "Oasis": during a short rest, reroll a downtime die and take the higher result.
  const oasis = kind === 'short' && ch.communityId === 'duneborne';
  const d4 = () => {
    const r = oasis ? Math.max(roll(4, rng), roll(4, rng)) : roll(4, rng);
    return { die: r, tier: d.tier, total: r + d.tier };
  };
  // "When you choose a downtime move that clears Stress on yourself, your companion clears an equal number of Stress."
  let companionCleared = 0;
  for (const m of moves) {
    switch (m.id) {
      case 'tend-to-wounds': { const r = d4(); c.hp = Math.max(0, c.hp - r.total); log.push({ move: m.id, roll: r, effect: `Cleared ${r.total} Hit Points` }); break; }
      case 'clear-stress': { const r = d4(); c.stress = Math.max(0, c.stress - r.total); companionCleared += r.total; log.push({ move: m.id, roll: r, effect: `Cleared ${r.total} Stress` }); break; }
      case 'repair-armor': { const r = d4(); c.armorMarked = Math.max(0, c.armorMarked - r.total); log.push({ move: m.id, roll: r, effect: `Cleared ${r.total} Armor Slots` }); break; }
      case 'tend-to-all-wounds': c.hp = 0; log.push({ move: m.id, effect: 'Cleared all Hit Points' }); break;
      case 'clear-all-stress': c.stress = 0; companionCleared += 99; log.push({ move: m.id, effect: 'Cleared all Stress' }); break;
      case 'repair-all-armor': c.armorMarked = 0; log.push({ move: m.id, effect: 'Cleared all Armor Slots' }); break;
      case 'prepare': {
        const n = m.withParty ? 2 : 1;
        c.hope = Math.min(d.hopeSlots, c.hope + n);
        log.push({ move: m.id, effect: `Gained ${n} Hope` });
        break;
      }
      case 'work-on-a-project': log.push({ move: m.id, effect: 'Advanced your project' }); break;
      default: throw new Error(`Unknown downtime move ${m.id}`);
    }
  }
  // Premium Bedroll: "During downtime, you automatically clear a Stress."
  if (carries(ch, 'premium-bedroll') && c.stress > 0) { c.stress -= 1; log.push({ move: 'bedroll', effect: 'Premium Bedroll: cleared a Stress' }); }
  // Insomniac's Periapt: a rest without clearing Hit Points or Stress gives +2 to attack and damage rolls until the next rest.
  const restless = carries(ch, 'insomniacs-periapt') && !moves.some((m) => /wounds|stress/.test(m.id));
  // Frostborne "Hardy": "When you take a rest, you clear a Hit Point."
  if (ch.communityId === 'frostborne' && c.hp > 0) { c.hp -= 1; log.push({ move: 'hardy', effect: 'Hardy: cleared a Hit Point' }); }
  // End of rest: refresh per-rest uses (and per-long-rest uses on a long rest).
  const clear = kind === 'long' ? [USE_SCOPES.rest, USE_SCOPES.longRest] : [USE_SCOPES.rest];
  // Counting dice (Unstoppable, Wild Surge) also end when you rest.
  c.uses = Object.fromEntries(Object.entries(c.uses).filter(([k]) => !clear.some((p) => k.startsWith(p)) && !k.startsWith('die:')));
  c.shortRestStreak = kind === 'short' ? c.shortRestStreak + 1 : 0;
  // Avoid Death: "They return to consciousness when … the party finishes a long rest."
  if (kind === 'long' && c.death === 'unconscious') c.death = undefined;
  if (c.active?.length) c = endActiveOnRest(c, kind);
  if (restless) { c = setActive(c, 'item:insomniacs-periapt', true); log.push({ move: 'periapt', effect: 'Insomniac’s Periapt: +2 to attack and damage rolls until your next rest' }); }
  c = restTokens(c, kind);
  if (c.companion) {
    // A companion that dropped out "returns with 1 Stress cleared" at the long rest.
    const back = kind === 'long' && c.companion.stress >= COMPANION_STRESS ? 1 : 0;
    const left = Math.max(0, c.companion.stress - companionCleared - back);
    if (left !== c.companion.stress) { c.companion = { ...c.companion, stress: left }; log.push({ move: 'companion', effect: `Companion: Stress ${left}` }); }
  }
  // Reanimated: Hit Points marked for good stay marked.
  if (c.permanentHp) c.hp = Math.max(c.hp, c.permanentHp);
  // Circle of Power tokens and Lasting-effect tokens go with the effect.
  for (const k of Object.keys(c.uses)) if (k.startsWith('tokens:sub:circle-of-power') && !(c.active ?? []).includes('sub:circle-of-power')) c.uses[k] = 0;
  // Vampire "Feed": "When you take a long rest, remove a token."
  if (kind === 'long' && c.transformation === 'vampire') c.uses = { ...c.uses, [FEED_KEY]: Math.max(0, (c.uses[FEED_KEY] ?? 0) - 1) };
  return { character: c, log };
}
