import { describe, expect, it } from 'vitest';
import lv1cards from '../../design/lv1cards.json';
import {
  DOMAINS, ancestries, armor, armorById, cardById, classById, classes, communities, transformationById, transformations,
  domainCards, guides, loot, mixedAncestry, rules, weaponById, weapons,
} from './index';
import type { Feature, TraitId } from './types';

const TRAITS: TraitId[] = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];
const RANGES = ['melee', 'very-close', 'close', 'far', 'very-far'];

const plain = (s: string) =>
  s.replace(/\*\*|__/g, '').replace(/(^|[^\w])_|_(?=[^\w]|$)/g, '$1').replace(/\s+/g, ' ').trim();

function expectFeature(f: Feature, where: string) {
  expect(f.id, where).toMatch(/^[a-z0-9-]+$/);
  expect(f.name, where).not.toBe('');
  expect(f.text.length, `${where}: ${f.name}`).toBeGreaterThan(5);
  expectCleanText(f.text, `${where}: ${f.name}`);
}

function expectCleanText(text: string, where: string) {
  expect(text.split('**').length % 2, `unbalanced bold in ${where}`).toBe(1);
  expect(text, `stray bold-italic marker in ${where}`).not.toMatch(/__/);
  expect(text, `double space in ${where}`).not.toMatch(/ {2}/);
}

function allClassFeatures() {
  return classes.flatMap((c) => [
    ...c.features.map((f) => [c.id, f] as const),
    [c.id, c.hopeFeature] as const,
    ...c.subclasses.flatMap((s) =>
      [...s.foundation, ...s.specialization, ...s.mastery].map((f) => [`${c.id}/${s.id}`, f] as const)),
  ]);
}

describe('classes', () => {
  it('has the 13 SRD classes', () => {
    expect(classes.map((c) => c.id)).toEqual([
      'assassin', 'bard', 'brawler', 'druid', 'guardian', 'ranger', 'rogue',
      'seraph', 'sorcerer', 'warlock', 'warrior', 'witch', 'wizard',
    ]);
  });

  it('matches the starting stats printed in the SRD', () => {
    // [domain1, domain2, HP, Evasion] — SRD pp. 9–31, same as the design mockup table.
    const expected: Record<string, [string, string, number, number]> = {
      assassin: ['blade', 'midnight', 5, 12], bard: ['grace', 'codex', 5, 10],
      brawler: ['valor', 'bone', 6, 10], druid: ['sage', 'arcana', 6, 10],
      guardian: ['valor', 'blade', 7, 9], ranger: ['bone', 'sage', 6, 12],
      rogue: ['midnight', 'grace', 6, 12], seraph: ['splendor', 'valor', 7, 9],
      sorcerer: ['arcana', 'midnight', 6, 10], warlock: ['dread', 'grace', 5, 11],
      warrior: ['blade', 'bone', 6, 11], witch: ['sage', 'dread', 6, 10],
      wizard: ['codex', 'splendor', 5, 11],
    };
    for (const c of classes) {
      const [d1, d2, hp, ev] = expected[c.id];
      expect([...c.domains, c.startingHitPoints, c.startingEvasion], c.id).toEqual([d1, d2, hp, ev]);
    }
  });

  it('has Spellcast traits per subclass', () => {
    const cast = Object.fromEntries(classes.map((c) => [c.id, c.subclasses.map((s) => s.spellcastTrait)]));
    expect(cast).toEqual({
      assassin: ['agility', 'knowledge'], bard: ['presence', 'presence'], brawler: [null, null],
      druid: ['instinct', 'instinct'], guardian: [null, null], ranger: ['agility', 'agility'],
      rogue: ['finesse', 'finesse'], seraph: ['strength', 'strength'], sorcerer: ['instinct', 'instinct'],
      warlock: ['presence', 'presence'], warrior: [null, null], witch: ['knowledge', 'instinct'],
      wizard: ['knowledge', 'knowledge'],
    });
  });

  it('has complete, well-formed features', () => {
    for (const c of classes) {
      expect(c.hopeFeature.hopeCost, c.id).toBe(3);
      expect(c.features.length, c.id).toBeGreaterThan(0);
      expect(c.classItems, c.id).toMatch(/ or /);
      expect(c.backgroundQuestions, c.id).toHaveLength(3);
      expect(c.connectionQuestions, c.id).toHaveLength(3);
      expect(c.subclasses, c.id).toHaveLength(2);
      for (const s of c.subclasses) {
        expect(s.foundation.length, s.id).toBeGreaterThan(0);
        expect(s.specialization.length, s.id).toBeGreaterThan(0);
        expect(s.mastery.length, s.id).toBeGreaterThan(0);
        expect(s.description, s.id).toMatch(/^Play the /);
      }
    }
    for (const [where, f] of allClassFeatures()) expectFeature(f, where);
  });

  it('keeps sub-options inside their parent feature', () => {
    const poison = classById.get('assassin')!.subclasses[1].foundation;
    expect(poison.map((f) => f.name)).toEqual(['Toxic Concoctions']);
    expect(poison[0].text).toContain('◦ **Ghost Petal:**');
    expect(classById.get('guardian')!.features[0].note).toMatch(/^If your Unstoppable Die is a d4/);
  });

  it('spot-checks feature text against the SRD', () => {
    const bard = classById.get('bard')!;
    expect(bard.hopeFeature.name).toBe('Make a Scene');
    expect(plain(bard.features[0].text)).toBe(
      'Once per session, describe how you rally the party and give yourself and each of your allies a Rally Die. ' +
      'At level 1, your Rally Die is a d6. A PC can spend their Rally Die to roll it, adding the result to their ' +
      'action roll, reaction roll, damage roll, or to clear a number of Stress equal to the result. At the end of ' +
      'each session, clear all unspent Rally Dice. At level 5, your Rally Die increases to a d8.');
    const renewal = classById.get('druid')!.subclasses[1];
    expect(renewal.foundation.map((f) => f.name)).toEqual(['Clarity of Nature', 'Regeneration']);
  });

  it('has the class extras', () => {
    const forms = classById.get('druid')!.extras.beastforms!.forms;
    expect(forms).toHaveLength(24);
    expect(forms.filter((f) => f.tier === 1)).toHaveLength(6);
    const scout = forms[0];
    expect(scout).toMatchObject({
      name: 'Agile Scout', trait: 'agility', traitBonus: 1, evasionBonus: 2,
      attack: { range: 'melee', trait: 'agility', damage: 'd4', type: 'phy' },
      advantages: ['deceive', 'locate', 'sneak'],
    });
    expect(classById.get('brawler')!.extras.martialStances!.stances).toHaveLength(16);
    expect(classById.get('ranger')!.extras.companion!.levelUpOptions).toHaveLength(8);
    expect(classById.get('warlock')!.extras.patronSpheres).toHaveLength(24);
  });
});

describe('guides', () => {
  it('covers every class with official suggestions', () => {
    expect(Object.keys(guides).sort()).toEqual(classes.map((c) => c.id));
  });

  it('suggests a legal trait spread and real tier 1 gear', () => {
    for (const [id, g] of Object.entries(guides)) {
      expect(Object.keys(g.traits), id).toEqual(TRAITS);
      expect(Object.values(g.traits).sort((a, b) => a - b), id).toEqual([...rules.creation.traitModifiers].sort((a, b) => a - b));
      if (g.primary.id) {
        const w = weaponById.get(g.primary.id);
        expect(w?.tier, id).toBe(1);
        expect(w?.category, id).toBe('primary');
        if (g.secondary) expect(w?.burden, `${id} pairs a two-handed primary with a secondary`).toBe(1);
      }
      if (g.secondary) expect(weaponById.get(g.secondary.id!)?.category, id).toBe('secondary');
      expect(armorById.get(g.armor.id)?.tier, id).toBe(1);
      for (const k of ['clothes', 'eyes', 'body', 'skin', 'attitude'] as const) {
        expect(g.description[k].length, `${id}.${k}`).toBeGreaterThan(3);
      }
      expect(g.inventory.chooseOne).toEqual(['A Minor Health Potion', 'A Minor Stamina Potion']);
      expect(g.inventory.classItem, id).toHaveLength(2);
    }
  });

  it('suggests magic weapons only for classes with a Spellcast trait', () => {
    for (const [id, g] of Object.entries(guides)) {
      const w = g.primary.id ? weaponById.get(g.primary.id)! : null;
      if (w && w.damage.type !== 'phy') {
        expect(classById.get(id)!.subclasses.some((s) => s.spellcastTrait), id).toBe(true);
      }
    }
  });

  it('matches the bard guide', () => {
    expect(guides.bard).toMatchObject({
      traits: { agility: 0, strength: -1, finesse: 1, instinct: 0, presence: 2, knowledge: 1 },
      primary: { id: 'rapier' },
      secondary: { id: 'small-dagger' },
      armor: { id: 'gambeson-armor' },
    });
    expect(guides.brawler.primary).toMatchObject({ id: null, name: 'Brawler’s Strike', damage: 'd8+d6' });
  });
});

describe('heritage', () => {
  it('has 24 ancestries with two features each', () => {
    expect(ancestries).toHaveLength(24);
    expect(ancestries.map((a) => a.id)).toContain('earthkin');
    expect(ancestries.filter((a) => a.group === 'Elemental Kin').map((a) => a.id))
      .toEqual(['earthkin', 'emberkin', 'skykin', 'tidekin']);
    for (const a of ancestries) {
      expect(a.features, a.id).toHaveLength(2);
      a.features.forEach((f) => expectFeature(f, a.id));
    }
    expect(ancestries.find((a) => a.id === 'elf')!.features.map((f) => f.name))
      .toEqual(['Quick Reactions', 'Celestial Trance']);
    expect(mixedAncestry.text).toContain('You must choose the first feature from one ancestry and the second from another.');
  });

  it('has the six transformations, two features and six questions each', () => {
    expect(transformations.map((t) => t.name)).toEqual(['Demigod', 'Ghost', 'Reanimated', 'Shapeshifter', 'Vampire', 'Werewolf']);
    for (const t of transformations) {
      expect(t.features.map((f) => f.name).every(Boolean), t.name).toBe(true);
      expect(t.questions, t.name).toHaveLength(6);
    }
    expect(transformationById.get('vampire')!.features[1].text).toMatch(/You can hold up to 6 tokens at a time/);
  });

  it('has 15 communities with six adjectives and one feature', () => {
    expect(communities).toHaveLength(15);
    for (const c of communities) {
      expect(c.adjectives, c.id).toHaveLength(6);
      expectFeature(c.feature, c.id);
    }
    expect(communities.find((c) => c.id === 'loreborne')!.feature.name).toBe('Well-Read');
  });
});

describe('domain cards', () => {
  it('has 21 cards in each of the 10 domains', () => {
    expect(domainCards).toHaveLength(210);
    for (const d of DOMAINS) {
      const cards = domainCards.filter((c) => c.domain === d);
      expect(cards, d).toHaveLength(21);
      expect(cards.filter((c) => c.level === 1), d).toHaveLength(3);
      for (let lvl = 2; lvl <= 10; lvl++) expect(cards.filter((c) => c.level === lvl), `${d} L${lvl}`).toHaveLength(2);
    }
    expect(new Set(domainCards.map((c) => c.id)).size).toBe(210);
  });

  it('matches the level 1 cards in the design handoff', () => {
    const ref = lv1cards as Record<string, { d: string; t: string; rc: number; x: string }>;
    for (const [name, r] of Object.entries(ref)) {
      const card = domainCards.find((c) => c.name.toLowerCase() === name.toLowerCase());
      expect(card, name).toBeDefined();
      expect(card!.domain).toBe(r.d.toLowerCase());
      expect(card!.type).toBe(r.t.toLowerCase());
      expect(card!.recallCost).toBe(r.rc);
      expect(plain(card!.text).replace(/\.$/, '')).toBe(plain(r.x).replace(/\.$/, ''));
    }
  });

  it('has clean text', () => {
    for (const c of domainCards) expectCleanText(c.text, c.name);
    expect(cardById.get('codex-book-of-ava')!.text.split('\n\n').map((p) => p.match(/^\*\*(.+?):\*\*/)?.[1]))
      .toEqual(['Power Push', 'Tava’s Armor', 'Ice Spike']);
  });
});

describe('equipment', () => {
  it('has weapons for every tier and category', () => {
    for (const tier of [1, 2, 3, 4]) {
      for (const cat of ['primary', 'secondary']) {
        expect(weapons.filter((w) => w.tier === tier && w.category === cat).length, `${tier} ${cat}`).toBeGreaterThan(10);
      }
    }
    expect(new Set(weapons.map((w) => w.id)).size).toBe(weapons.length);
    for (const w of weapons) {
      expect(RANGES, w.id).toContain(w.range);
      expect([...TRAITS, 'spellcast'], w.id).toContain(w.trait);
      expect([4, 6, 8, 10, 12, 20], w.id).toContain(w.damage.die);
      if (w.feature) expect(w.feature.name, w.id).not.toBe('');
    }
  });

  it('matches SRD tier 1 rows', () => {
    expect(weaponById.get('broadsword')).toMatchObject({
      tier: 1, category: 'primary', trait: 'agility', range: 'melee',
      damage: { die: 8, bonus: 0, type: 'phy' }, burden: 1, feature: { name: 'Reliable', text: '+1 to attack rolls' },
    });
    expect(weaponById.get('focus-runes')).toMatchObject({
      category: 'secondary', trait: 'instinct', range: 'very-close', damage: { die: 6, bonus: 0, type: 'mag' },
      feature: { name: 'Focused', text: '+1 to primary weapon damage to targets within Very Close range' },
    });
    expect(weaponById.get('whipsword')!.feature!.name).toBe('Versatile');
    expect(weaponById.get('improved-twisted-dagger')).toMatchObject({ tier: 2, damage: { die: 8, bonus: 3 } });
  });

  it('has armor for every tier', () => {
    expect(armor.filter((a) => a.tier === 1).map((a) => a.name)).toEqual([
      'Mage Robes', 'Gambeson Armor', 'Brigandine Armor', 'Leather Armor',
      'Scale Mail Armor', 'Chainmail Armor', 'Banded Armor', 'Full Plate Armor',
    ]);
    expect(armorById.get('gambeson-armor')).toMatchObject({ thresholds: { major: 5, severe: 11 }, score: 3 });
    for (const t of [2, 3, 4]) expect(armor.filter((a) => a.tier === t).length).toBeGreaterThan(8);
    for (const a of armor) expect(a.thresholds.severe, a.id).toBeGreaterThan(a.thresholds.major);
  });

  it('has the loot tables', () => {
    for (const kind of ['item', 'consumable'] as const) {
      for (const set of ['core', 'additional'] as const) {
        const rolls = loot.filter((l) => l.kind === kind && l.set === set).map((l) => l.roll);
        expect(rolls, `${kind} ${set}`).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
      }
    }
    expect(loot.find((l) => l.id === 'minor-health-potion')).toMatchObject({ kind: 'consumable', text: 'Clear 1d4 HP.' });
  });
});

describe('rules', () => {
  it('has creation defaults and caps', () => {
    expect(rules.creation).toMatchObject({ level: 1, stress: 6, hope: 2, proficiency: 1, traitModifiers: [2, 1, 1, 0, 0, -1] });
    expect(rules.caps).toMatchObject({ hope: 6, armorScore: 12, loadout: 5 });
  });

  it('has the downtime moves', () => {
    expect(rules.downtime.short.moves.map((m) => m.id)).toEqual(['tend-to-wounds', 'clear-stress', 'repair-armor', 'prepare']);
    expect(rules.downtime.long.moves.map((m) => m.id))
      .toEqual(['tend-to-all-wounds', 'clear-all-stress', 'repair-all-armor', 'prepare', 'work-on-a-project']);
    expect(rules.downtime.shortRestsBeforeLong).toBe(3);
  });

  it('has advancement slots per tier', () => {
    const slots = Object.fromEntries(rules.leveling.advancements.map((a) => [a.id, a.slots]));
    expect(slots.traits).toEqual({ 2: 3, 3: 3, 4: 3 });
    expect(slots.proficiency).toEqual({ 2: 0, 3: 2, 4: 2 });
    expect(rules.leveling.achievements.map((a) => a.level)).toEqual([2, 5, 8]);
  });
});
