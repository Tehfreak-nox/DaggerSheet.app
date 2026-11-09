// Tap controls derived from a feature's or card's rules text. The text stays
// the source of truth; these are shortcuts for what it tells you to do.
//
// The rules applied to every text:
// 1. A cost you pay (Spend Hope / Mark Stress) and the roll, dice or damage it
//    pays for become one button that pays and rolls. That's a cost and a roll in
//    the same sentence ("Mark 2 Stress to make a Spellcast Roll"), or a cost
//    followed in the next sentence by the damage it causes or "When you do, roll".
// 2. A roll is a button only when the text tells you to make it, not when it's a
//    condition ("before you make a Spellcast Roll"). Reaction rolls using your
//    Spellcast trait are buttons too.
// 3. Anything that changes your next roll or damage is armed and spent by it:
//    "+2 to the roll", advantage, "add a d6 to your damage roll", a d20 Hope Die.
// 4. "Any number of" costs and tokens get an amount picker; uses get boxes.
// Only costs you pay count: "force them to mark a Stress" is not your Stress.
import type { TraitId } from '../data';

export type UseScope = 'rest' | 'longRest' | 'session' | 'scene';

/** How many dice: a number, or one of your stats. */
export type Count = number | 'proficiency' | 'spellcast' | TraitId;

/** Class resources kept as counters on the sheet (Martial Artist Focus, Warlock Favor). */
export type Resource = 'focus' | 'favor';
export const RESOURCES: Record<Resource, { name: string; max: number; start: number }> = {
  focus: { name: 'Focus', max: 6, start: 0 },
  favor: { name: 'Favor', max: 6, start: 3 },
};

export type Cost = { hope: number } | { stress: number } | { res: Resource; n: number };

export type RollControl = { kind: 'roll'; trait: TraitId | 'spellcast'; difficulty?: number; reaction?: boolean; label: string };
export type DiceControl = { kind: 'dice'; count: Count; sides: number; bonus: number; label: string; upgrade?: { level: number; sides: number } };
export type DamageControl = { kind: 'damage'; count: Count; sides: number; bonus: number; type: 'magic' | 'physical' | null; label: string };
/** "make an attack (with your primary weapon)": rolls your weapon attack. */
export type AttackControl = { kind: 'attack'; primary?: boolean; label: string };

/** What an armed effect does to your next roll or damage roll. */
export type ArmEffect =
  | { roll: number }
  | { rollStat: TraitId | 'proficiency' }
  | { advantage: true; damageDice?: { count: number; sides: number } }
  | { damageDice: { count: number | 'tier'; sides: number } }
  | { damageBonus: number }
  | { damageStat: TraitId; times: number }
  | { proficiency: number }
  /** "use a d20 as your damage die". */
  | { damageDie: number }
  | { doubleDamage: true }
  /** Roll a die and add it to your next action roll (Patron Die). */
  | { rollDie: number }
  /** Roll a die into your next action roll or damage roll, whichever comes first (Rally Die). */
  | { anyDie: number }
  /** "+3 bonus to the result of your Hope Die" (Contacts Everywhere). */
  | { hopeBonus: number }
  /** Adept: your next Experience costs a Stress instead of a Hope and counts double. */
  | { adept: true }
  /** Feed: your Fear Die is a d20 on the next action roll. */
  | { fearDie: number }
  /** "+1 bonus to your next Agility Roll": only a roll of that trait. */
  | { traitRoll: TraitId; value: number }
  /** "the next successful attack you make critically succeeds" (Homet's Secret Potion). */
  | { critOnHit: true };

/** What a one-tap feature does for you ("clear 2 Stress and gain 2 Hope"). */
export interface Gain { hope?: number; stress?: number; hp?: number; armor?: number; res?: { res: Resource; n: number }; uses?: Record<string, number> }

export type Control =
  | { kind: 'hope'; n: number; label: string; once?: UseScope }
  /** Pay a class resource (Spend a Favor, Spend a Focus). */
  | { kind: 'spend'; cost: Cost; label: string; once?: UseScope; gain?: Gain }
  /** Gain or clear something in one tap (Battle Ritual, Limit Breaker, songs). */
  | { kind: 'gain'; gain: Gain; cost?: Cost; label: string; once?: UseScope; max?: number; useKey?: string; note?: string }
  /** A class resource counter (Focus, Favor). */
  | { kind: 'resource'; res: Resource; label: string;
    /** Refocus: once per rest, clear Focus and gain the highest of your Instinct in d6s. */
    refocus?: boolean;
    /** Tribute (a downtime move): gain Favor equal to your Spellcast trait. */
    tribute?: boolean }
  /** Dice kept with their values (Prayer Dice): spend one for Hope, or on a roll from the result card. */
  | { kind: 'heldDice'; store: string; label: string }
  /** A die you hold until you spend it (your own Rally Die). */
  | { kind: 'rallyDie'; sides: number; label: string }
  /** A d6 on the card choosing an effect for the session (Lunar Phases). */
  | { kind: 'phaseDie'; label: string }
  /** Choose a number kept on the sheet (Strange Patterns). */
  | { kind: 'pickNumber'; field: 'strangePatterns'; min: number; max: number; label: string }
  /** Choose a die size kept on the sheet (Combo Die). */
  | { kind: 'pickDie'; field: 'comboDie'; options: number[]; label: string }
  /** Channel Raw Power: put a loadout card in the vault for Hope or damage. */
  | { kind: 'channelRaw'; label: string }
  /** An attack that isn't a weapon (Fangs, Elemental Breath, Long Tongue). */
  | { kind: 'natural'; trait: TraitId | 'best'; dice: { count: Count; sides: number }; type: 'magic' | 'physical'; cost?: Cost; label: string }
  | { kind: 'stress'; n: number; label: string; once?: UseScope }
  | RollControl
  | DiceControl
  | DamageControl
  | AttackControl
  /** Rule 1: pay and roll in one tap. */
  | { kind: 'pay'; cost: Cost; then: RollControl | DiceControl | DamageControl | AttackControl; label: string; once?: UseScope }
  /** Rule 3: armed for the next roll (paid now, refunded if disarmed). */
  | { kind: 'arm'; cost?: Cost; effect: ArmEffect; max?: number; persist?: boolean; label: string; once?: UseScope;
    /** Paid with tokens from the card ("spend one token to choose one of the following options"). */
    tokenCost?: number }
  /** Rule 4: choose an amount; pay that much (Hope, Stress or tokens) and roll that many dice. */
  | { kind: 'scaled'; unit: 'hope' | 'stress' | 'tokens' | 'count' | Resource; min: number; max?: number;
    per?: { sides: number; bonus: number; damage: boolean; type: 'magic' | 'physical' | null; toDamageRoll?: boolean };
    flat?: number; toRoll?: boolean; label: string; once?: UseScope;
    /** Patron Dice: count results of `atLeast` or higher (and clear that many Hit Points with `clearHp`). */
    atLeast?: number; clearHp?: boolean;
    /** Show the highest result (Otherworldly Ire). */
    highest?: boolean;
    /** The amount paid becomes tokens on this card (Enchanted Talisman). */
    toTokens?: boolean;
    /** What the amount does, shown in the toast ("the target marks that many Stress"). */
    note?: string }
  /** Choose one bonus for the roll (Teleport). */
  | { kind: 'choice'; options: { label: string; value: number }[]; label: string }
  | { kind: 'uses'; scope: UseScope; max: number; label: string }
  | { kind: 'tokens'; source: TokenSource; label: string }
  /** "roll a d20 as your Hope Die": armed for the next action roll. */
  | { kind: 'hopeDie'; sides: number; label: string }
  /**
   * A die kept on the sheet that counts up from 1 (Unstoppable Die, Wild Surge,
   * Zone of Protection). `addsTo`: its value is added to your damage or action rolls.
   */
  | { kind: 'dieCounter'; sides: number; upgrade?: { level: number; sides: number }; addsTo?: 'damage' | 'action'; label: string }
  /**
   * A pool of dice you collect (Slayer Dice): gained instead of a Hope on a roll
   * with Hope, up to your Proficiency; armed into an attack or damage roll; at the
   * end of the session unspent dice clear and give a Hope each.
   */
  | { kind: 'dicePool'; name: string; sides: number; max: 'proficiency'; hopeAtSessionEnd: boolean; label: string };

export type TokenSource =
  | { fixed: number }
  | { trait: TraitId | 'spellcast'; min?: number }
  | { stat: 'tier' | 'proficiency' | 'level' }
  | { roll: { count: number; sides: number; bonus: number } }
  | { manual: true };

const TRAITS: Record<string, TraitId> = {
  agility: 'agility', strength: 'strength', finesse: 'finesse',
  instinct: 'instinct', presence: 'presence', knowledge: 'knowledge',
};
const TRAIT_RE = 'Agility|Strength|Finesse|Instinct|Presence|Knowledge';

const WORD_NUM: Record<string, number> = { a: 1, an: 1, one: 1, another: 1, 'an additional': 1, two: 2, three: 3, four: 4, five: 5 };

export const strip = (s: string) => s.replace(/\*\*|__/g, '').replace(/(^|[^\w])_|_(?=[^\w]|$)/g, '$1');

const n = (w: string) => WORD_NUM[w.toLowerCase()] ?? Number(w);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const SCOPES: [RegExp, UseScope][] = [
  [/long rest/i, 'longRest'],
  [/short rest|rest/i, 'rest'],
  [/session/i, 'session'],
  [/scene/i, 'scene'],
];
function scopeOf(s: string): UseScope {
  for (const [re, sc] of SCOPES) if (re.test(s)) return sc;
  return 'rest';
}

function countOf(word: string | undefined, using: string | undefined): Count {
  if (word) return Number(word);
  if (!using) return 1;
  if (/Proficiency/i.test(using)) return 'proficiency';
  if (/Spellcast/i.test(using)) return 'spellcast';
  return TRAITS[using.toLowerCase()] ?? 1;
}

export function diceText(count: Count, sides: number, bonus: number): string {
  const c = typeof count === 'number' ? String(count) : '';
  return `${c}d${sides}${bonus ? `+${bonus}` : ''}`;
}

export function costLabel(c: Cost): string {
  return 'hope' in c ? `${c.hope} Hope` : 'stress' in c ? `${c.stress} Stress` : `${c.n} ${RESOURCES[c.res].name}`;
}

interface Sentence { text: string; at: number; para: number }

function sentencesOf(text: string): Sentence[] {
  const out: Sentence[] = [];
  let para = 0;
  const re = /[^.!?\n]+(?:[.!?]+|$)|\n/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0] === '\n') { if (text[m.index + 1] === '\n') para++; continue; }
    if (m[0].trim()) out.push({ text: m[0], at: m.index, para });
  }
  return out;
}

/** The text sits inside "( … )" at this point. */
function inParens(text: string, at: number): boolean {
  const before = text.slice(0, at);
  return before.lastIndexOf('(') > before.lastIndexOf(')');
}

/** Words just before a match that make it a condition, not an instruction. */
const CONDITION_LEAD = /\b(before|when|whenever|after|if|would|each time|the next time)\b(\s+(you|they|an? \w+|the \w+))?(\s+(would|can|could))?(\s+\w+ly)?\s*$/i;
/** Still inside an opening condition: "When you would mark a Stress, …", "After you cast a spell or make an attack …". */
function inCondition(text: string, at: number): boolean {
  const start = Math.max(text.lastIndexOf('.', at - 1), text.lastIndexOf('\n', at - 1), text.lastIndexOf('◦', at - 1)) + 1;
  const prefix = text.slice(start, at);
  return /^\s*(?:Additionally,\s*|Once per [\w ]+?,?\s*)?(when|whenever|after|before|if|each time)\b/i.test(prefix) && !prefix.includes(',');
}

/** Someone else marks it: "force them to mark", "they must mark", "the target marks". */
const OTHER_SUBJECT = /\b(force|forces|forced|forcing|must|they|them|target|targets|adversary|adversaries|ally|allies|companion|creature|creatures|attacker|it|each|the dome)\b[^.,;]{0,40}?\s*$/i;

/**
 * Card text in sections: paragraphs that start with a bold name ("**Power Push:**")
 * are separate spells or options with their own controls.
 */
export function sectionsOf(raw: string): { title?: string; text: string }[] {
  const paras = raw.split(/\n\n/);
  const named = paras.filter((p) => /^\*\*[^*]+:\*\*/.test(p));
  if (named.length < 2) return [{ text: raw }];
  const out: { title?: string; text: string }[] = [];
  for (const p of paras) {
    const m = /^\*\*([^*]+):\*\*\s*/.exec(p);
    if (m) out.push({ title: m[1], text: p.slice(m[0].length) });
    else if (out.length) out[out.length - 1].text += `\n\n${p}`;
    else out.push({ text: p });
  }
  return out;
}

export function controlsFor(rawText: string): Control[] {
  const text = strip(rawText);
  const found: { at: number; c: Control }[] = [];
  const seen = new Set<string>();
  const add = (at: number, c: Control) => {
    const key = JSON.stringify(c);
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ at, c });
  };
  /** Text spans already turned into a control; later passes skip them. */
  const used: [number, number][] = [];
  const isUsed = (a: number, b = a + 1) => used.some(([x, y]) => a < y && b > x);
  const take = (a: number, b: number) => used.push([a, b]);
  const sentences = sentencesOf(text);

  // Uses: "Once per long rest", "twice per session" (not examples in parentheses).
  for (const m of text.matchAll(/\b(once|twice|three times) per (long rest|short rest|rest|session|scene)\b/gi)) {
    if (inParens(text, m.index!)) continue;
    const max = m[1].toLowerCase() === 'once' ? 1 : m[1].toLowerCase() === 'twice' ? 2 : 3;
    add(-2, { kind: 'uses', scope: scopeOf(m[2]), max, label: `${cap(m[1])} per ${m[2].toLowerCase()}` });
  }

  // Tokens.
  const tok = /\bplace (?:a number of |a )?(?:(\d+d\d+(?:\+\d+)?|\d+) )?tokens?\b(?:[^.]*?(?:equal to (?:your |the )?(Spellcast trait|Agility|Strength|Finesse|Instinct|Presence|Knowledge|tier|Proficiency|level)))?(?:[^.]*\(minimum (\d+)\))?/i.exec(text);
  if (tok && !/would place|Place tokens on this card to represent/i.test(tok[0]) || /Place tokens on this card to represent/i.test(text)) {
    let source: TokenSource = { manual: true };
    if (tok?.[1] && /d/.test(tok[1])) {
      const [, c, s, b] = /(\d+)d(\d+)(?:\+(\d+))?/.exec(tok[1])!;
      source = { roll: { count: Number(c), sides: Number(s), bonus: Number(b ?? 0) } };
    } else if (tok?.[1]) {
      source = { fixed: Number(tok[1]) };
    } else if (tok?.[2] && /equal to (?:your |the )?\w/.test(tok[0]) && !/equal to the number of/i.test(tok[0])) {
      const w = tok[2].toLowerCase();
      source = w === 'spellcast trait' ? { trait: 'spellcast', min: tok[3] ? Number(tok[3]) : undefined }
        : w === 'tier' || w === 'proficiency' || w === 'level' ? { stat: w }
        : { trait: TRAITS[w], min: tok[3] ? Number(tok[3]) : undefined };
    }
    add(-1, { kind: 'tokens', source, label: 'Tokens' });
  }

  // A bigger Hope Die: "you can roll a d20 as your Hope Die".
  for (const m of text.matchAll(/\broll a d(\d+) as your Hope Die\b/gi)) {
    add(m.index!, { kind: 'hopeDie', sides: Number(m[1]), label: `d${m[1]} Hope Die` });
    take(m.index!, m.index! + m[0].length);
  }

  // A die that grows with level: "At level 1, your Rally Die is a d6 … At level 5, your Rally Die increases to a d8".
  const grows = /\b(?:At level 1, your ([\w ]+?) Die is a d(\d+)[^]*?At level (\d+), your [\w ]+? Die increases to a d(\d+)|Your ([\w ]+?) Die starts at a d(\d+) and increases to a d(\d+) at level (\d+))/i.exec(text);
  const facing = /with the 1 value facing up/i.exec(text);
  const addsTo = /add the current value of the [\w ]+? Die to your damage roll/i.test(text) ? 'damage' as const
    : /add its value to every action roll/i.test(text) ? 'action' as const : undefined;
  if (grows) {
    const name = grows[1] ?? grows[5];
    const [from, lvl, to] = grows[1] ? [grows[2], grows[3], grows[4]] : [grows[6], grows[8], grows[7]];
    add(grows.index, facing
      ? { kind: 'dieCounter', sides: Number(from), upgrade: { level: Number(lvl), sides: Number(to) }, addsTo, label: `${name} Die` }
      : { kind: 'dice', count: 1, sides: Number(from), bonus: 0, label: `Roll ${name} Die`, upgrade: { level: Number(lvl), sides: Number(to) } });
    for (const m of text.matchAll(/\bd\d+\b/g)) if (m.index! >= grows.index && m.index! < grows.index + grows[0].length + 2) take(m.index!, m.index! + m[0].length);
  }

  // A die placed on the card that counts up (Wild Surge, Zone of Protection).
  const placed = !grows && facing ? /\bplace an? d(\d+) on this card/i.exec(text) : null;
  if (placed) add(placed.index, { kind: 'dieCounter', sides: Number(placed[1]), addsTo, label: 'Die' });

  // Dice stored on the card and later added to a damage roll (Sigil of Retribution).
  const pool = /\bplace a d(\d+) on this card\. You can hold a number of d\d+s equal to your level\.[^.]*?roll the dice on this card and add the total to your damage roll/i.exec(text);
  if (pool) {
    add(-1, { kind: 'tokens', source: { manual: true }, label: `d${pool[1]}s on this card` });
    add(pool.index + 1, { kind: 'scaled', unit: 'tokens', min: 1, per: { sides: Number(pool[1]), bonus: 0, damage: false, type: null, toDamageRoll: true }, label: `Add the d${pool[1]}s to your damage` });
    take(pool.index, pool.index + pool[0].length);
  }

  // Dice that are trackers, not rolls: "place a d6 on this card", "hold a number of d8s",
  // and "a 1d6 bonus to your damage rolls".
  for (const m of text.matchAll(/\bplace an? d\d+ on this card|\bhold a number of d\d+s|\b\d*d\d+ bonus to (?:your )?damage rolls?(?: with that weapon)?|\b\d*d\d+s? instead of (?:a )?\d*d\d+s?|\binstead of (?:a )?\d*d\d+s?|\bincreases? to (?:a )?\d*d\d+|\bd\d+\+d\d+|\buses \d*d\d+s/gi)) take(m.index!, m.index! + m[0].length);
  for (const m of text.matchAll(/\([^)]*\)/g)) if (/\bd\d+/.test(m[0])) take(m.index!, m.index! + m[0].length);

  // ---- Rule 3: arms -------------------------------------------------------
  const armAt = (re: RegExp, make: (m: RegExpExecArray) => Extract<Control, { kind: 'arm' }>) => {
    for (const m of text.matchAll(new RegExp(re.source, 'gi'))) {
      if (isUsed(m.index!)) continue;
      add(m.index!, make(m as RegExpExecArray));
      take(m.index!, m.index! + m[0].length);
    }
  };
  const costOf = (verb: string, amount: string): Cost => (/spend/i.test(verb) ? { hope: n(amount) } : { stress: n(amount) });
  armAt(/\b(spend|mark) (a|an|one|two|\d+) (?:Hope|Stress)(?: before you roll)? to gain a \+(\d+) bonus to (?:the|that|your|the result)[^.]*?(?:roll|result)\b/, (m) => {
    const cost = costOf(m[1], m[2]);
    return { kind: 'arm', cost, effect: { roll: Number(m[3]) }, label: `+${m[3]} to the roll · ${costLabel(cost)}` };
  });
  armAt(/\b(mark|spend) (a|an) (Stress|Hope) before you roll to gain a \+(\d+) bonus to the result/, (m) => {
    const cost = costOf(m[1], m[2]);
    return { kind: 'arm', cost, effect: { roll: Number(m[4]) }, label: `+${m[4]} to the roll · ${costLabel(cost)}` };
  });
  armAt(new RegExp(`\\b(spend|mark) (a|an) (?:Hope|Stress) to add your (${TRAIT_RE}|Proficiency) to (?:the|a|your) [^.]*?roll`), (m) => {
    const cost = costOf(m[1], m[2]);
    const stat = (m[3] === 'Proficiency' ? 'proficiency' : TRAITS[m[3].toLowerCase()]) as TraitId | 'proficiency';
    return { kind: 'arm', cost, effect: { rollStat: stat }, label: `+${m[3]} to the roll · ${costLabel(cost)}` };
  });
  armAt(/\bmark a Stress to use a d(\d+) as your damage die/, (m) => (
    { kind: 'arm', cost: { stress: 1 }, effect: { damageDie: Number(m[1]) }, label: `d${m[1]} damage die · 1 Stress` }));
  armAt(/\b(spend|mark) (a|an) (?:Hope|Stress) to gain advantage on (?:a|an|the) (?:[\w ]*?roll|attack)/, (m) => {
    const cost = costOf(m[1], m[2]);
    return { kind: 'arm', cost, effect: { advantage: true }, label: `Advantage · ${costLabel(cost)}` };
  });
  armAt(new RegExp(`\\bmark a Stress to gain a bonus to your damage roll equal to twice your (${TRAIT_RE})`), (m) => {
    const twice = /twice per attack/i.test(text);
    return { kind: 'arm', cost: { stress: 1 }, effect: { damageStat: TRAITS[m[1].toLowerCase()], times: 2 }, max: twice ? 2 : 1, label: `+2× ${m[1]} damage · 1 Stress` };
  });
  armAt(/\bmark a Stress to make the next successful attack against that same target deal an extra (\d+)d(\d+) damage/, (m) => (
    { kind: 'arm', cost: { stress: 1 }, effect: { damageDice: { count: Number(m[1]), sides: Number(m[2]) } }, label: `+${m[1]}d${m[2]} next hit · 1 Stress` }));
  armAt(/\bYou have advantage on the attack, add a d(\d+) to the damage roll/, (m) => {
    // Boost: the Stress that buys it is the sentence before.
    const s = sentences.find((x) => x.at < m.index! && /^\s*Mark a Stress to\b/i.test(x.text));
    if (s) take(s.at, s.at + 16);
    return { kind: 'arm', cost: s ? { stress: 1 } : undefined, effect: { advantage: true, damageDice: { count: 1, sides: Number(m[1]) } }, label: `Advantage +d${m[1]} damage${s ? ' · 1 Stress' : ''}` };
  });
  const costBefore = (at: number): Cost | undefined => {
    const start = Math.max(text.lastIndexOf('.', at - 1), text.lastIndexOf('\n', at - 1)) + 1;
    const c = /\b(spend|mark) (a|an|one|two|\d+) (Hope|Stress)\b/i.exec(text.slice(start, at));
    if (!c) return undefined;
    take(start + c.index, start + c.index + c[0].length);
    return /spend/i.test(c[1]) ? { hope: n(c[2]) } : { stress: n(c[2]) };
  };
  armAt(/\b(?:deal|dealing|deals) an extra (\d+)d(\d+) (?:(magic|physical) )?damage/, (m) => {
    const cost = costBefore(m.index!);
    return { kind: 'arm', cost, effect: { damageDice: { count: Number(m[1]), sides: Number(m[2]) } }, label: `+${m[1]}d${m[2]} damage${cost ? ' · ' + costLabel(cost) : ''}` };
  });
  armAt(/\badding (\d+)d(\d+) to your damage roll/, (m) => (
    { kind: 'arm', effect: { damageDice: { count: Number(m[1]), sides: Number(m[2]) } }, label: `+${m[1]}d${m[2]} damage` }));
  armAt(/\badd a number of d(\d+)s equal to your tier to (?:your|the) damage roll/, (m) => (
    { kind: 'arm', effect: { damageDice: { count: 'tier', sides: Number(m[1]) } }, persist: true, label: `+d${m[1]} × tier damage` }));
  armAt(/\bgain a (\d*)d(\d+) bonus to damage rolls with that weapon/, (m) => {
    // Ignition: the Stress that lights the weapon opens the paragraph.
    const para = text.lastIndexOf('\n', m.index!) + 1;
    const cost = costBefore(m.index!) ?? (/^Mark a Stress\b/i.test(text.slice(para)) ? (take(para, para + 13), { stress: 1 }) : undefined);
    return { kind: 'arm', cost, effect: { damageDice: { count: Number(m[1] || 1), sides: Number(m[2]) } }, persist: true, label: `+${m[1] || 1}d${m[2]} damage${cost ? ' · ' + costLabel(cost) : ''}` };
  });
  armAt(/\bmark a Stress to gain a \+1 bonus to your Proficiency(?: for that attack)?/, () => (
    { kind: 'arm', cost: { stress: 1 }, effect: { proficiency: 1 }, label: '+1 Proficiency · 1 Stress' }));
  armAt(/\bspend a Hope and describe [^.]*?then either gain a \+(\d+) bonus to the roll or a \+(\d+) bonus to the roll’s damage/, (m) => {
    add(m.index! + 1, { kind: 'arm', cost: { hope: 1 }, effect: { damageBonus: Number(m[2]) }, label: `+${m[2]} damage · 1 Hope` });
    return { kind: 'arm', cost: { hope: 1 }, effect: { roll: Number(m[1]) }, label: `+${m[1]} to the roll · 1 Hope` };
  });
  // A pool of dice (Slayer Dice).
  const dicePool = /\bpool of dice called ([\w ]+?)\. On a roll with Hope, you can place an? d(\d+) on this card instead of gaining a Hope[^.]*\. You can store a number of [\w ]+? equal to your Proficiency/i.exec(text);
  if (dicePool) {
    add(dicePool.index, { kind: 'dicePool', name: dicePool[1], sides: Number(dicePool[2]), max: 'proficiency', hopeAtSessionEnd: /gain a Hope per die cleared/i.test(text), label: dicePool[1] });
    take(dicePool.index, text.length);
  }
  // "Spend one token to choose one of the following options": advantage is one of them.
  armAt(/◦ You make the attack with advantage/, () => ({ kind: 'arm', effect: { advantage: true }, label: 'Advantage on the attack' }));
  armAt(/\badd a d(\d+) to (?:your|the) damage roll/, (m) => (
    { kind: 'arm', effect: { damageDice: { count: 1, sides: Number(m[1]) } }, label: `+d${m[1]} to damage` }));
  armAt(/\b(spend|mark) (\d+|a|an) (Hope|Stress) to charge [^.]*\.\s*When you next successfully attack with a weapon, double the result of your damage roll/, (m) => {
    const cost = costOf(m[1], m[2]);
    return { kind: 'arm', cost, effect: { doubleDamage: true }, label: `Double next weapon damage · ${costLabel(cost)}` };
  });

  // ---- Rule 4: amounts ----------------------------------------------------
  const scaled = (at: number, end: number, c: Extract<Control, { kind: 'scaled' }>) => { add(at, c); take(at, end); };
  for (const m of text.matchAll(/\b(spend|mark) any number of (Hope|Stress)(?: and| to)?([^.]*?)\b(?:roll (?:that many|an equal number of|that number of) d(\d+)s)/gi)) {
    const unit = /hope/i.test(m[2]) ? 'hope' : 'stress';
    const rest = text.slice(m.index! + m[0].length, m.index! + m[0].length + 60);
    const damage = /^,? dealing (magic|physical)? ?damage|deal that much (magic|physical)? ?damage/i.exec(rest);
    scaled(m.index!, m.index! + m[0].length, { kind: 'scaled', unit, min: 1, per: { sides: Number(m[4]), bonus: 0, damage: !!damage, type: (damage?.[1] ?? damage?.[2])?.toLowerCase() as 'magic' | 'physical' ?? null }, label: `${unit === 'hope' ? 'Spend Hope' : 'Mark Stress'} · d${m[4]} each` });
  }
  for (const m of text.matchAll(/\bspend any number of Hope\b[^.]*\.\s*Roll a number of d(\d+)s equal to the Hope spent and deal that much (magic|physical)? ?damage/gi)) {
    scaled(m.index!, m.index! + m[0].length, { kind: 'scaled', unit: 'hope', min: 1, per: { sides: Number(m[1]), bonus: 0, damage: true, type: (m[2]?.toLowerCase() as 'magic') ?? null }, label: 'Spend Hope · d' + m[1] + ' damage each' });
  }
  for (const m of text.matchAll(/\bMark any number of Stress\b[^.]*\.\s*[^.]*?take (\d*)d(\d+)(?:\+(\d+))? (magic|physical) damage for each Stress marked/gi)) {
    scaled(m.index!, m.index! + m[0].length, { kind: 'scaled', unit: 'stress', min: 1, per: { sides: Number(m[2]), bonus: Number(m[3] ?? 0), damage: true, type: m[4].toLowerCase() as 'magic' }, label: `Mark Stress · d${m[2]}${m[3] ? '+' + m[3] : ''} damage each` });
  }
  for (const m of text.matchAll(/\broll a number of d(\d+)s equal to the tokens you spent and deal that much (magic|physical)? ?damage/gi)) {
    scaled(m.index!, m.index! + m[0].length, { kind: 'scaled', unit: 'tokens', min: 1, per: { sides: Number(m[1]), bonus: 0, damage: true, type: (m[2]?.toLowerCase() as 'magic') ?? null }, label: `Spend tokens · d${m[1]} damage each` });
  }
  for (const m of text.matchAll(/\bspend any number of tokens to add (?:a |1)?d(\d+) for each token spent to your damage roll/gi)) {
    scaled(m.index!, m.index! + m[0].length, { kind: 'scaled', unit: 'tokens', min: 1, per: { sides: Number(m[1]), bonus: 0, damage: false, type: null, toDamageRoll: true }, label: `Spend tokens · +d${m[1]} damage each` });
  }
  for (const m of text.matchAll(/\bspend any number of tokens to (?:roll that number of |reduce the damage by 1?)d(\d+)s?/gi)) {
    scaled(m.index!, m.index! + m[0].length, { kind: 'scaled', unit: 'tokens', min: 1, per: { sides: Number(m[1]), bonus: 0, damage: false, type: null }, label: `Spend tokens · roll d${m[1]} each` });
  }
  for (const m of text.matchAll(/\bspend any number of these tokens to gain a \+(\d+) bonus to the roll for each token spent/gi)) {
    scaled(m.index!, m.index! + m[0].length, { kind: 'scaled', unit: 'tokens', min: 1, flat: Number(m[1]), toRoll: true, label: `Spend tokens · +${m[1]} to the roll each` });
  }
  for (const m of text.matchAll(/\bgain a \+(\d+) bonus to your damage roll for each token on this card/gi)) {
    scaled(m.index!, m.index! + m[0].length, { kind: 'scaled', unit: 'tokens', min: 1, flat: Number(m[1]), label: `Spend tokens · +${m[1]} damage each` });
  }
  for (const m of text.matchAll(/\broll a number of d(\d+)s equal to the number of [^.]*?(layers|stolen Fear)/gi)) {
    scaled(m.index!, m.index! + m[0].length, { kind: 'scaled', unit: 'count', min: 1, per: { sides: Number(m[1]), bonus: 0, damage: /damage/i.test(text.slice(m.index!, m.index! + 160)), type: null }, label: `Roll d${m[1]}s (${m[2]})` });
  }
  for (const m of text.matchAll(/\b(spend|mark) (any number of|(\d+) or more|up to (\d+)) (Hope|Stress)/gi)) {
    if (isUsed(m.index!)) continue;
    const unit = /hope/i.test(m[5]) ? 'hope' : 'stress';
    scaled(m.index!, m.index! + m[0].length, { kind: 'scaled', unit, min: m[3] ? Number(m[3]) : 1, max: m[4] ? Number(m[4]) : undefined, label: unit === 'hope' ? 'Spend Hope' : 'Mark Stress' });
  }

  // Choose-one bonuses ("If you know the place very well, gain a +3 bonus.").
  const choices = [...text.matchAll(/◦ If ([^,]+), gain (?:a ([+−-]\d+) (?:bonus|penalty)|no modifier)/g)];
  if (choices.length >= 2) {
    add(choices[0].index!, { kind: 'choice', options: choices.map((m) => ({ label: cap(m[1]), value: m[2] ? Number(m[2].replace('−', '-')) : 0 })), label: 'Choose one' });
    take(choices[0].index!, choices[choices.length - 1].index! + choices[choices.length - 1][0].length);
  }

  // ---- singles --------------------------------------------------------------
  const costs: { at: number; end: number; cost: Cost }[] = [];
  for (const m of text.matchAll(/\b(spend|mark) (a|an|one|two|three|four|five|\d+|another|an additional) (Hope|Stress|Focus|Favor)\b/gi)) {
    if (isUsed(m.index!)) continue;
    const lead = text.slice(Math.max(0, m.index! - 50), m.index!);
    if (OTHER_SUBJECT.test(lead) && !/\byou(?: can| must)?\s*$|\b(?:and|or)\s*$|^\s*$|[.:]\s*$/i.test(lead.slice(-12))) continue;
    if (/\b(you can both|can choose who marks)/i.test(lead)) continue;
    if (CONDITION_LEAD.test(lead) || (inCondition(text, m.index!) && !/\byou can\s*$/i.test(lead))) continue;
    const amount = n(m[2]);
    costs.push({ at: m.index!, end: m.index! + m[0].length, cost: /hope/i.test(m[3]) ? { hope: amount } : /stress/i.test(m[3]) ? { stress: amount } : { res: m[3].toLowerCase() as Resource, n: amount } });
  }

  const rolls: { at: number; end: number; c: RollControl | AttackControl }[] = [];
  for (const m of text.matchAll(new RegExp(`\\bmake an? (Spellcast|${TRAIT_RE}) Roll(?: \\((\\d+)\\))?`, 'gi'))) {
    const lead = text.slice(Math.max(0, m.index! - 30), m.index!);
    if (CONDITION_LEAD.test(lead) || inCondition(text, m.index!)) continue;
    const trait = m[1].toLowerCase() === 'spellcast' ? 'spellcast' : TRAITS[m[1].toLowerCase()];
    const difficulty = m[2] ? Number(m[2]) : undefined;
    rolls.push({ at: m.index!, end: m.index! + m[0].length, c: { kind: 'roll', trait, difficulty, label: `${cap(m[1])} Roll${difficulty ? ` (${difficulty})` : ''}` } });
  }
  for (const m of text.matchAll(new RegExp(`\\bby succeeding on an? (${TRAIT_RE}) Roll`, 'gi'))) {
    rolls.push({ at: m.index!, end: m.index! + m[0].length, c: { kind: 'roll', trait: TRAITS[m[1].toLowerCase()], label: `${cap(m[1])} Roll` } });
  }
  for (const m of text.matchAll(/\bmak(?:e|ing) a reaction roll (?:against [^.]*? )?using your Spellcast trait/gi)) {
    rolls.push({ at: m.index!, end: m.index! + m[0].length, c: { kind: 'roll', trait: 'spellcast', reaction: true, label: 'Spellcast reaction roll' } });
  }
  for (const m of text.matchAll(/\bmak(?:e|ing) an attack(?: roll)?(?: with your (primary) weapon)?/gi)) {
    const lead = text.slice(Math.max(0, m.index! - 40), m.index!);
    if (CONDITION_LEAD.test(lead) || inCondition(text, m.index!) || /\b(must|they|the target|creature|adversary|PC|PCs|ally)\s+(\w+\s+)?$/i.test(lead)) continue;
    if (/^ against another adversary/i.test(text.slice(m.index! + m[0].length))) continue;
    rolls.push({ at: m.index!, end: m.index! + m[0].length, c: { kind: 'attack', primary: !!m[1], label: m[1] ? 'Attack · primary weapon' : 'Attack' } });
  }

  const dice: { at: number; end: number; c: DiceControl | DamageControl }[] = [];
  const DMG = new RegExp(`\\b(\\d*)d(\\d+)(?:\\s*\\+\\s*(\\d+))?\\s+(?:(?:direct )?(magic|physical) )?damage(?:(?: to [^.,]*?)? using your (Proficiency|Spellcast trait|${TRAIT_RE}))?`, 'gi');
  for (const m of text.matchAll(DMG)) {
    if (isUsed(m.index!)) continue;
    const count = countOf(m[1] || undefined, m[5]);
    const bonus = m[3] ? Number(m[3]) : 0;
    const before = text.slice(Math.max(0, m.index! - 120), m.index!);
    const named = /◦ ([A-Z][\w’' ]+): [^◦]*$/.exec(before)?.[1];
    const outcome = /On a roll with (Hope|Fear), deal\s*$/.exec(before)?.[1];
    const label = `${named ? named + ' · ' : outcome ? `With ${outcome} · ` : ''}${diceText(count, Number(m[2]), bonus)}${m[4] ? ' ' + m[4].toLowerCase() : ''}`;
    dice.push({ at: m.index!, end: m.index! + m[0].length, c: { kind: 'damage', count, sides: Number(m[2]), bonus, type: (m[4]?.toLowerCase() as 'magic' | 'physical') ?? null, label } });
  }
  for (const m of text.matchAll(new RegExp(`\\broll a number of d(\\d+)s equal to your (?:subclass’s )?(Proficiency|Spellcast trait|${TRAIT_RE})`, 'gi'))) {
    const count = countOf(undefined, m[2]);
    const dealt = /^ and deal that much (magic|physical)? ?damage/i.exec(text.slice(m.index! + m[0].length));
    const c: DiceControl | DamageControl = dealt
      ? { kind: 'damage', count, sides: Number(m[1]), bonus: 0, type: (dealt[1]?.toLowerCase() as 'magic') ?? null, label: `d${m[1]} × ${m[2]}` }
      : { kind: 'dice', count, sides: Number(m[1]), bonus: 0, label: `Roll d${m[1]} × ${m[2]}` };
    dice.push({ at: m.index!, end: m.index! + m[0].length + (dealt?.[0].length ?? 0), c });
    take(m.index!, m.index! + m[0].length + (dealt?.[0].length ?? 0));
  }
  for (const m of text.matchAll(/\b(\d*)d(\d+)(?:\s*\+\s*(\d+))?\b/gi)) {
    const at = m.index!;
    if (isUsed(at) || dice.some((x) => at >= x.at && at < x.end)) continue;
    if (tok?.[1] && text.indexOf(tok[1]) === at) continue;
    const count = m[1] ? Number(m[1]) : 1;
    const bonus = m[3] ? Number(m[3]) : 0;
    dice.push({ at, end: at + m[0].length, c: { kind: 'dice', count, sides: Number(m[2]), bonus, label: `Roll ${count}d${m[2]}${bonus ? `+${bonus}` : ''}` } });
  }

  // ---- Rule 1: a cost and what it pays for -----------------------------------
  const sentenceOf = (at: number) => sentences.findIndex((s) => at >= s.at && at < s.at + s.text.length);
  const paid = new Set<number>();
  for (const k of costs) {
    const si = sentenceOf(k.at);
    const s = sentences[si];
    const after = (x: { at: number }) => x.at > k.at && sentenceOf(x.at) === si;
    // Same sentence: a roll or attack ("Mark 2 Stress to make a Spellcast Roll"), else dice it buys.
    let then: RollControl | DiceControl | DamageControl | AttackControl | undefined;
    let pick: { at: number } | undefined = rolls.find((r) => after(r) && /^\s*(to|and)\b/i.test(text.slice(k.end, r.at)));
    if (pick) then = (pick as typeof rolls[number]).c;
    if (!then) {
      const d = dice.find((x) => after(x) && !rolls.some((r) => r.at > k.at && r.at < x.at));
      if (d) { pick = d; then = d.c; }
    }
    // Next sentence: the damage it causes, "When you do, roll a d6", or "Make a … Roll" after "to use this spell as an attack".
    const next = sentences[si + 1];
    if (!then && next && next.para === s.para) {
      const inNext = (x: { at: number }) => sentenceOf(x.at) === si + 1;
      const r = rolls.find(inNext);
      const d = dice.find(inNext);
      if (/to use this spell as an attack/i.test(s.text) && r) { pick = r; then = r.c; }
      else if (d && (/^\s*When you do, roll/i.test(next.text)
        || (!/^\s*(◦|•|When|If|Whenever|Additionally)/i.test(next.text) && /\b(take|takes|clear|clears|deal|deals)\b/i.test(next.text) && !rolls.some(inNext)))) { pick = d; then = d.c; }
    }
    if (then && pick) {
      paid.add(pick.at);
      const what = then.kind === 'roll' ? (then.trait === 'spellcast' ? 'Spellcast' : then.label) : then.kind === 'attack' ? 'Attack' : diceText(then.count, then.sides, then.bonus);
      add(k.at, { kind: 'pay', cost: k.cost, then, label: `${costLabel(k.cost)} · ${what}` });
    } else {
      add(k.at, 'hope' in k.cost ? { kind: 'hope', n: k.cost.hope, label: `Spend ${k.cost.hope} Hope` } : 'stress' in k.cost ? { kind: 'stress', n: k.cost.stress, label: `Mark ${k.cost.stress} Stress` } : { kind: 'spend', cost: k.cost, label: `Spend ${costLabel(k.cost)}` });
    }
  }
  for (const r of rolls) if (!paid.has(r.at)) add(r.at, r.c);
  for (const d of dice) if (!paid.has(d.at)) add(d.at, d.c);

  // Options bought with a token: each arm among them uses one.
  const tokenChoice = /\bspend (?:one|a) token to choose one of the following options/i.exec(text);
  if (tokenChoice) {
    const end = text.indexOf('\n\n', tokenChoice.index);
    for (const f of found) if (f.c.kind === 'arm' && f.at > tokenChoice.index && (end < 0 || f.at < end)) f.c.tokenCost = 1;
  }

  // "Once per rest, spend 3 Hope to …": paying uses up the feature for the rest.
  for (const f of found) {
    if (f.at < 0 || !['hope', 'stress', 'pay', 'arm', 'scaled'].includes(f.c.kind)) continue;
    const st = sentences.find((x) => f.at >= x.at && f.at < x.at + x.text.length);
    const once = st && /^\s*Once per (long rest|rest|session|scene),/i.exec(st.text);
    if (once) (f.c as { once?: UseScope }).once = scopeOf(once[1]);
  }
  return found.sort((a, b) => a.at - b.at).map((x) => x.c).slice(0, 10);
}
