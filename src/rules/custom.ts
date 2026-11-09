// Features whose rules the text reader can't turn into buttons on its own:
// class resources (Focus, Favor, Prayer Dice, Rally, Combo Die), states with
// choices and one-tap effects. Each entry replaces or adds to the controls read
// from the feature's text (see mechanics.ts), keeping each card to one or two buttons.
import { weaponById } from '../data';
import { derive, hasFeature, tierOf } from './derive';
import { patronDie } from './active';
import type { Control, Cost } from './mechanics';
import type { Character } from './model';

const FAVOR: Cost = { res: 'favor', n: 1 };
const FOCUS: Cost = { res: 'focus', n: 1 };

/** Rally Die: d6, a d8 from level 5, a d10 with Epic Poetry. */
export function rallyDie(ch: Character): number {
  return hasFeature(ch, 'epic-poetry') ? 10 : ch.level >= 5 ? 8 : 6;
}

/** Marked for Death dice: d4s, d6s with Ambush, d8s with Backstab. */
export function markedDie(ch: Character): number {
  return hasFeature(ch, 'backstab') ? 8 : hasFeature(ch, 'ambush') ? 6 : 4;
}

/** Feature key without its source prefix for multiclass ("mc:rally" → "class:rally"). */
function norm(key: string): string {
  return key.replace(/^mc:/, 'class:').replace(/^mcsub:/, 'sub:');
}

type Make = (ch: Character, parsed: Control[]) => Control[];

const songs = (ch: Character): Control[] => {
  const max = hasFeature(ch, 'virtuoso') ? 2 : 1;
  return [
    { kind: 'gain', gain: { hp: 1 }, label: 'Relaxing Song · clear a Hit Point', once: 'longRest', max, useKey: 'longRest:song:relaxing', note: 'You and allies within Close range clear a Hit Point.' },
    { kind: 'gain', gain: {}, label: 'Epic Song · target Vulnerable', once: 'longRest', max, useKey: 'longRest:song:epic', note: 'A target within Close range is temporarily Vulnerable.' },
    { kind: 'gain', gain: { hope: 1 }, label: 'Heartbreaking Song · +1 Hope', once: 'longRest', max, useKey: 'longRest:song:heartbreaking', note: 'You and allies within Close range gain a Hope.' },
  ];
};

const CUSTOM: Record<string, Make> = {
  // ---- Assassin
  'class:marked-for-death': (ch) => [{ kind: 'arm', cost: { stress: 1 }, persist: true, effect: { damageDice: { count: 'tier', sides: markedDie(ch) } },
    label: `Marked for Death · +${tierOf(ch.level)}d${markedDie(ch)} damage · 1 Stress` }],
  'sub:ambush': () => [],
  'sub:backstab': () => [],
  'sub:toxic-concoctions': () => [
    { kind: 'tokens', source: { roll: { count: 1, sides: 4, bonus: 1 } }, label: 'Poison tokens' },
    { kind: 'arm', effect: { damageDice: { count: 1, sides: 6 } }, tokenCost: 1, label: 'Leech Weed · +1d6 damage' },
  ],
  // ---- Bard
  'class:rally': (ch) => [{ kind: 'rallyDie', sides: rallyDie(ch), label: 'Rally Die' }],
  'sub:gifted-performer': songs,
  'sub:virtuoso': () => [],
  'sub:epic-poetry': () => [],
  // ---- Brawler
  'class:combo-strike': () => [{ kind: 'pickDie', field: 'comboDie', options: [4, 6, 8, 10, 12], label: 'Combo Die' }],
  'sub:stance-fighter': () => [{ kind: 'resource', res: 'focus', refocus: true, label: 'Focus' }],
  'sub:keen-defenses': (ch) => [{ kind: 'spend', cost: FOCUS, label: `+${tierOf(ch.level)} Evasion vs. this attack · 1 Focus` }],
  'sub:focus-cannon': () => [{ kind: 'pay', cost: FOCUS, then: { kind: 'roll', trait: 'instinct', label: 'Instinct Roll' }, label: '1 Focus · Instinct Roll' },
    { kind: 'damage', count: 'proficiency', sides: 20, bonus: 3, type: 'magic', label: 'd20+3 magic' }],
  'sub:limit-breaker': () => [{ kind: 'gain', gain: { hope: 1, stress: 1 }, once: 'rest', label: 'Limit Breaker · +1 Hope, clear a Stress' }],
  'sub:flow-state': () => [],
  // ---- Druid
  'sub:elemental-incarnation': () => [],
  'sub:elemental-dominion': () => [],
  // ---- Ranger
  // ---- Rogue
  'sub:adrenaline': () => [],
  'sub:contacts-everywhere': (ch) => {
    const n = hasFeature(ch, 'reliable-backup') ? 3 : 1;
    return [
      { kind: 'uses', scope: 'session', max: n, label: n === 1 ? 'Once per session' : 'Three times per session' },
      { kind: 'arm', effect: { hopeBonus: 3 }, once: 'session', label: '+3 to your Hope Die' },
      { kind: 'arm', effect: { damageDice: { count: 2, sides: 8 } }, once: 'session', label: '+2d8 damage' },
    ];
  },
  'sub:reliable-backup': () => [],
  // ---- Seraph
  'class:prayer-dice': () => [{ kind: 'heldDice', store: 'prayer', label: 'Prayer Dice' }],
  'sub:devout': () => [],
  'sub:sparing-touch': (ch) => [{ kind: 'uses', scope: 'longRest', max: hasFeature(ch, 'devout') ? 2 : 1, label: hasFeature(ch, 'devout') ? 'Twice per long rest' : 'Once per long rest' }],
  'sub:wings-of-light': (ch, parsed) => parsed.map((c) => (c.kind === 'arm' && hasFeature(ch, 'power-of-the-gods')
    ? { ...c, effect: { damageDice: { count: 1, sides: 12 } }, label: '+1d12 damage · 1 Hope' } : c)),
  'sub:power-of-the-gods': () => [],
  // ---- Sorcerer
  'class:channel-raw-power': () => [{ kind: 'channelRaw', label: 'Channel Raw Power' }],
  'sub:transcendence': () => [],
  'sub:manipulate-magic': () => [],
  'sub:arcane-charge': () => [],
  // ---- Warlock
  'class:patrons-pact': (ch) => [{ kind: 'arm', cost: FAVOR, effect: { rollDie: patronDie(ch.level) }, label: `+d${patronDie(ch.level)} Patron Die · 1 Favor` }],
  'class:favor': () => [{ kind: 'resource', res: 'favor', tribute: true, label: 'Favor' }],
  'sub:patrons-mantle': () => [],
  'sub:patrons-fury': () => [],
  'sub:deathless-embrace': (ch) => [{ kind: 'scaled', unit: 'favor', min: 1, once: 'rest', per: { sides: patronDie(ch.level), bonus: 0, damage: false, type: null }, atLeast: 4, clearHp: true, label: 'Spend Favor · Patron Dice' }],
  'sub:harrowing-invocation': () => [{ kind: 'spend', cost: FAVOR, label: 'Disadvantage on their attack · 1 Favor' }],
  'sub:damage-sink': () => [{ kind: 'spend', cost: FAVOR, once: 'rest', label: 'Halve the damage · 1 Favor' }],
  'sub:dark-aegis': () => [{ kind: 'spend', cost: FAVOR, once: 'longRest', label: 'No Hit Points marked · 1 Favor' }],
  'sub:draining-bane': () => [{ kind: 'spend', cost: FAVOR, gain: { stress: 1 }, label: 'Drain · clear a Stress · 1 Favor' }],
  'sub:deadly-vengeance': (ch) => [{ kind: 'scaled', unit: 'favor', min: 1, per: { sides: patronDie(ch.level), bonus: 0, damage: false, type: null }, atLeast: 4, note: 'the attacker marks a Hit Point for each', label: 'Spend Favor · Patron Dice' }],
  'sub:menacing-reach': () => [{ kind: 'spend', cost: FAVOR, label: '+1 range step · 1 Favor' }],
  'sub:diminish-my-foes': () => [{ kind: 'scaled', unit: 'favor', min: 1, note: 'the target marks that many Stress', label: 'Spend Favor' }],
  'sub:fearsome-attack': () => [],
  'sub:otherworldly-ire': (ch) => [{ kind: 'scaled', unit: 'favor', min: 1, once: 'rest', per: { sides: patronDie(ch.level), bonus: 0, damage: false, type: null }, highest: true, note: 'that many creatures within Close range each mark a Hit Point', label: 'Spend Favor · Patron Dice' }],
  // ---- Warrior
  'sub:battle-ritual': () => [{ kind: 'gain', gain: { hope: 2, stress: 2 }, once: 'longRest', label: 'Battle Ritual · +2 Hope, clear 2 Stress' }],
  'sub:rise-to-the-challenge': () => [],
  'sub:courage': () => [],
  'sub:weapon-specialist': (ch) => {
    const w = ch.secondary ? weaponById.get(ch.secondary.id) : undefined;
    return w ? [{ kind: 'arm', cost: { hope: 1 }, effect: { damageDice: { count: 1, sides: w.damage.die } }, label: `+1d${w.damage.die} (${w.name}) · 1 Hope` }] : [];
  },
  'sub:martial-preparation': () => [{ kind: 'gain', gain: { uses: { 'pool:sub:slayer': 1 } }, label: 'Martial Preparation (downtime) · +1 Slayer Die' }],
  // ---- Witch
  'sub:enchanted-talisman': () => [
    { kind: 'tokens', source: { manual: true }, label: 'Talisman tokens' },
    { kind: 'scaled', unit: 'hope', min: 1, once: 'rest', toTokens: true, label: 'Spend Hope · tokens' },
  ],
  'sub:circle-of-power': () => [{ kind: 'tokens', source: { manual: true }, label: 'Circle tokens' }],
  'sub:moonbeam': () => [],
  'sub:lunar-phases': () => [{ kind: 'phaseDie', label: 'Lunar Phase' }],
  // ---- Wizard
  'class:strange-patterns': () => [{ kind: 'pickNumber', field: 'strangePatterns', min: 1, max: 12, label: 'Your number' }],
  'sub:adept': () => [{ kind: 'arm', effect: { adept: true }, label: 'Adept · next Experience: a Stress, doubled' }],
  'sub:honed-expertise': () => [],
  'sub:face-your-fear': () => [],
  'sub:fueled-by-fear': () => [],
  'sub:have-no-fear': () => [],
  'sub:conjure-shield': () => [],
  // ---- Ancestries and communities
  'anc:elemental-breath': () => [{ kind: 'natural', trait: 'instinct', dice: { count: 'proficiency', sides: 8 }, type: 'magic', label: 'Elemental Breath' }],
  'anc:long-tongue': () => [{ kind: 'natural', trait: 'finesse', dice: { count: 'proficiency', sides: 12 }, type: 'physical', cost: { stress: 1 }, label: 'Long Tongue · 1 Stress' }],
  'anc:charge': () => [{ kind: 'pay', cost: { stress: 1 }, then: { kind: 'damage', count: 1, sides: 12, bonus: 0, type: 'physical', label: '1d12 physical' }, label: '1 Stress · 1d12 physical' }],
  'anc:unshakable': () => [],
  'anc:retract': () => [],
  'anc:eye-of-the-storm': () => [],
  // ---- Items you carry (keyed by the Equipment page: "gear:item-<id>")
  'gear:item-piercing-arrows': (ch) => [
    { kind: 'uses', scope: 'rest', max: 3, label: 'Three times per rest' },
    { kind: 'arm', effect: { damageBonus: derive(ch).proficiency }, once: 'rest', label: `+${derive(ch).proficiency} damage (arrow hit)` },
  ],
  'gear:item-corrector-sprite': () => [{ kind: 'uses', scope: 'rest', max: 1, label: 'Once per short rest' }, { kind: 'arm', effect: { advantage: true }, once: 'rest', label: 'Advantage on an attack' }],
  'gear:item-titans-girdle': () => [{ kind: 'uses', scope: 'scene', max: 1, label: 'Once per scene' }, { kind: 'arm', effect: { proficiency: 1 }, once: 'scene', label: '+1 Proficiency next attack' }],
  'gear:item-charging-quiver': (ch) => [{ kind: 'arm', effect: { damageBonus: tierOf(ch.level) }, persist: true, label: `+${tierOf(ch.level)} damage with these arrows` }],
  'gear:item-lorekeeper': () => [{ kind: 'arm', effect: { roll: 1 }, label: '+1 vs. a creature in the book' }],
  'gear:item-calming-pendant': () => [],
  'gear:item-valorstone': () => [],
  'gear:item-hopehold-flare': () => [],
  'gear:item-phobophages-circlet': () => [{ kind: 'uses', scope: 'scene', max: 1, label: 'Once per scene' }, { kind: 'gain', gain: { stress: 1 }, once: 'scene', label: 'Rolled a 4 · clear a Stress' }],
  'gear:item-eclipse-coin': () => [{ kind: 'uses', scope: 'rest', max: 1, label: 'Once per rest' },
    { kind: 'arm', effect: { roll: 1 }, persist: true, label: 'Heads · +1 to attacks until you hit' }],
  // ---- Transformations
  'tf:fangs': () => [{ kind: 'natural', trait: 'best', dice: { count: 'proficiency', sides: 6 }, type: 'physical', label: 'Fangs' }],
  'tf:feed': () => [
    { kind: 'tokens', source: { manual: true }, label: 'Feed tokens (max 6)' },
    { kind: 'arm', effect: { fearDie: 20 }, tokenCost: 1, label: 'd20 Fear Die' },
  ],
  'tf:wolf-form': () => [],
  'tf:howling-rampage': (ch) => [{ kind: 'damage', count: tierOf(ch.level), sides: 20, bonus: 0, type: 'physical', label: 'Howling Rampage' }],
};

/**
 * Features used from the roll's result card (rerolls, "make it a roll with Hope",
 * "add a d4"): their card keeps only its use boxes, so there's one place to tap.
 */
const ON_RESULT_CARD = [
  'sub:heart-of-a-poet', 'anc:luckbender', 'anc:nimble-fingers', 'anc:feline-instincts', 'anc:adaptability', 'anc:fearless',
  'anc:internal-compass', 'hope:sorcerer', 'hope:warlock', 'sub:true-strike',
];
for (const k of ON_RESULT_CARD) if (!(k in CUSTOM)) CUSTOM[k] = (_ch, parsed) => parsed.filter((c) => c.kind === 'uses');

/** The controls a feature shows: read from its text, then adjusted by the table above. */
export function customControls(ch: Character, featureKey: string, parsed: Control[]): Control[] {
  const make = CUSTOM[norm(featureKey)];
  return make ? make(ch, parsed) : parsed;
}

export function hasCustom(featureKey: string): boolean {
  return norm(featureKey) in CUSTOM;
}
