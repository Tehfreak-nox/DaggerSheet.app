import { describe, expect, it } from 'vitest';
import { ancestries, cardById, classes, communities, domainCards } from '../data';
import { controlsFor, sectionsOf, type Control } from './mechanics';

const show = (x: Control): string => {
  switch (x.kind) {
    case 'pay': return `pay ${x.label}`;
    case 'arm': return `arm ${x.label}`;
    case 'scaled': return `scaled ${x.label}`;
    case 'damage': return `damage ${x.label}`;
    case 'dice': return `dice ${x.label}`;
    case 'roll': return `roll ${x.label}`;
    case 'choice': return `choice ${x.options.map((o) => o.value).join('/')}`;
    default: return `${x.kind} ${x.label}`;
  }
};
const card = (id: string) => controlsFor(cardById.get(id)!.text).map(show);
const allFeatures = () => [
  ...classes.flatMap((c) => [c.hopeFeature, ...c.features, ...c.subclasses.flatMap((s) => [...s.foundation, ...s.specialization, ...s.mastery]),
    ...(c.extras.beastforms?.forms.flatMap((b) => b.features) ?? [])]),
  ...ancestries.flatMap((a) => a.features),
  ...communities.map((c) => c.feature),
];
const feature = (id: string) => controlsFor(allFeatures().find((f) => f.id === id)!.text).map(show);

describe('card and feature controls (reviewed against every card)', () => {
  it('parses every text without throwing', () => {
    for (const c of domainCards) for (const s of sectionsOf(c.text)) controlsFor(s.text);
    for (const f of allFeatures()) controlsFor(f.text);
  });

  it('pays and rolls in one tap when a cost buys the roll', () => {
    expect(card('arcana-chain-lightning')).toEqual(['pay 2 Stress · Spellcast', 'damage 2d8+4 magic']);
    expect(card('midnight-rain-of-blades')).toEqual(['pay 1 Hope · Spellcast', 'damage d8+2 magic', 'damage 1d8']);
    expect(card('valor-ground-pound')).toEqual(['pay 2 Hope · Strength Roll', 'damage 4d10+8']);
    expect(card('arcana-rune-ward')).toEqual(['pay 1 Hope · 1d8']);
    expect(card('dread-horror')).toEqual(['uses Once per scene', 'pay 1 Stress · d8+1']);
    expect(card('splendor-bolt-beacon')).toEqual(['roll Spellcast Roll', 'pay 1 Hope · d8+2']);
    expect(card('valor-shrug-it-off')).toEqual(['pay 1 Stress · 1d6']);
    expect(card('sage-towering-stalk')).toEqual(['uses Once per rest', 'pay 1 Stress · Spellcast', 'damage d8 physical']);
    expect(feature('regeneration')).toEqual(['pay 3 Hope · 1d4']);
    expect(feature('rangers-focus')).toEqual(['pay 1 Hope · Attack']);
  });

  it('keeps a cost apart from dice it does not pay for', () => {
    expect(card('sage-vicious-entangle')).toEqual(['roll Spellcast Roll', 'damage 1d8+1 physical', 'hope Spend 1 Hope']);
    expect(card('sage-thorn-skin')).toEqual(['uses Once per rest', 'tokens Tokens', 'hope Spend 1 Hope', 'scaled Spend tokens · roll d6 each']);
    expect(feature('elemental-incarnation')).toEqual(['stress Mark 1 Stress', 'damage Fire · 1d10 magic']);
  });

  it('only makes buttons for rolls the text tells you to make', () => {
    expect(card('sage-natures-tongue')).toEqual(['roll Instinct Roll (12)', 'arm +2 to the roll · 1 Hope']);
    expect(card('arcana-cloaking-blast')).toEqual(['hope Spend 1 Hope']);
    expect(card('blade-onslaught')).toEqual(['stress Mark 1 Stress']);
    expect(card('valor-lead-by-example')).toEqual(['stress Mark 1 Stress']);
    expect(feature('manipulate-magic')).toEqual(['stress Mark 1 Stress']);
    expect(card('arcana-counterspell')).toEqual(['roll Spellcast reaction roll']);
  });

  it('counts only your own Hope and Stress', () => {
    expect(card('grace-hypnotic-shimmer')).toEqual(['uses Once per rest', 'roll Spellcast Roll']);
    expect(card('sage-death-grip')).toEqual(['roll Spellcast Roll', 'damage 3d6+2 physical']);
    expect(card('bone-tactician')).toEqual(['hopeDie d20 Hope Die']);
    expect(feature('unshakable')).toEqual(['dice Roll 1d6']);
    expect(controlsFor('On a success, the target must mark a Stress.')).toEqual([]);
    expect(card('dread-blighting-strike')).toContain('stress Mark 1 Stress');
  });

  it('arms what changes your next roll or damage', () => {
    expect(card('blade-reckless')).toEqual(['arm Advantage · 1 Stress']);
    expect(card('blade-rage-up')).toEqual(['arm +2× Strength damage · 1 Stress']);
    expect(card('bone-breaking-blow')).toEqual(['arm +2d12 next hit · 1 Stress']);
    expect(card('bone-boost')).toEqual(['arm Advantage +d10 damage · 1 Stress']);
    expect(card('splendor-smite')).toEqual(['uses Once per rest', 'arm Double next weapon damage · 3 Hope']);
    expect(card('valor-bold-presence')).toEqual(['uses Once per rest', 'arm +Strength to the roll · 1 Hope']);
    expect(card('grace-notorious')).toEqual(['arm +10 to the roll · 1 Stress']);
    expect(card('codex-codex-touched')).toEqual(['uses Once per rest', 'arm +Proficiency to the roll · 1 Stress']);
    expect(feature('pack-hunting')).toEqual(['arm +d8 to damage']);
    expect(feature('tusks')).toEqual(['arm +1d6 damage · 1 Hope']);
    expect(feature('ignition')).toEqual(['arm +1d6 damage · 1 Stress']);
    expect(feature('sneak-attack')).toEqual(['arm +d6 × tier damage']);
    expect(feature('elementalist')).toEqual(['arm +2 to the roll · 1 Hope', 'arm +3 damage · 1 Hope']);
  });

  it('asks for an amount for "any number of"', () => {
    expect(card('codex-book-of-illiat').length).toBeGreaterThan(0);
    const illiat = sectionsOf(cardById.get('codex-book-of-illiat')!.text);
    expect(illiat.map((s) => s.title)).toEqual(['Slumber', 'Arcane Barrage', 'Telepathy']);
    expect(controlsFor(illiat[1].text).map(show)).toEqual(['uses Once per rest', 'scaled Spend Hope · d6 damage each']);
    expect(card('arcana-falling-sky')).toEqual(['roll Spellcast Roll', 'scaled Mark Stress · d20+2 damage each']);
    expect(card('dread-damnation')).toEqual(['roll Spellcast Roll', 'scaled Mark Stress · d20 each']);
    expect(card('arcana-unleash-chaos')).toEqual(['tokens Tokens', 'roll Spellcast Roll', 'scaled Spend tokens · d10 damage each', 'stress Mark 1 Stress']);
    expect(card('sage-corrosive-projectile')).toEqual(['roll Spellcast Roll', 'damage d6+4 magic', 'scaled Mark Stress']);
  });

  it('uses your stats for dice counts', () => {
    const blast = controlsFor(cardById.get('arcana-preservation-blast')!.text).find((c) => c.kind === 'damage');
    expect(blast).toMatchObject({ count: 'spellcast', sides: 8, bonus: 3 });
    const tele = controlsFor(cardById.get('arcana-telekinesis')!.text).find((c) => c.kind === 'damage');
    expect(tele).toMatchObject({ count: 'proficiency', sides: 12, bonus: 4 });
    expect(card('codex-banish')).toContain('dice Roll d20 × Spellcast trait');
    expect(card('valor-unyielding-armor')).toEqual(['dice Roll d6 × Proficiency']);
  });

  it('skips dice that only describe a rule', () => {
    expect(feature('draining-bane')).toEqual(['spend Spend 1 Favor']);
    expect(feature('i-am-the-weapon')).toEqual([]);
    expect(feature('fueled-by-fear')).toEqual([]);
    expect(feature('power-of-the-gods')).toEqual(['arm +1d12 damage']);
    expect(card('splendor-invigoration')).toEqual(['scaled Spend Hope · d6 each']);
    expect(feature('rally')).toEqual(['uses Once per session', 'dice Roll Rally Die']);
    // A die that counts up on the sheet: a counter, not a roll button.
    expect(feature('unstoppable')).toEqual(['uses Once per long rest', 'dieCounter Unstoppable Die']);
    expect(controlsFor(allFeatures().find((f) => f.id === 'unstoppable')!.text).find((c) => c.kind === 'dieCounter'))
      .toMatchObject({ sides: 4, upgrade: { level: 5, sides: 6 }, addsTo: 'damage' });
    expect(card('sage-wild-surge')).toContain('dieCounter Die');
  });

  it('names damage options and keeps the text order', () => {
    expect(card('sage-tempest')).toEqual(['roll Spellcast Roll', 'damage Blizzard · 2d20+8 magic', 'damage Hurricane · 3d10+10 magic', 'damage Sandstorm · 5d6+9 magic']);
    expect(card('arcana-blink-out')).toEqual(['roll Spellcast Roll (12)', 'hope Spend 1 Hope']);
    expect(card('codex-teleport')).toEqual(['uses Once per long rest', 'roll Spellcast Roll (16)', 'choice 3/1/0/-2']);
  });
});
