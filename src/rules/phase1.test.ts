// Phase 1 (full SRD pass): class resources, states with choices, transformations
// and features that now work on their own. The sweep at the end tries to break
// them: every class, subclass and transformation, levelled 1 → 10, with every
// lasting effect switched on, then scenes, sessions and rests run over them.
import { describe, expect, it } from 'vitest';
import { ancestries, classes, communities, loot, lootById, transformations } from '../data';
import {
  ACTIVE, ITEM_USE, companionStats, newCompanion, trainingAllowed, type CompanionPick, activeCtx, applyLevelUp, attackProfile, damageRoll, moveLimit, controlsFor, createCharacter, creationProblems, customControls, derive, endScene,
  inEffect, isActive, newSession, rest, seededRng, setActive, starving, type Character, type Control, type Rng,
} from './index';
import { guideInput, pick, randomLevelUp } from './simulate';

function make(classId: string, subclassId: string, opts: { ancestry?: string; community?: string; level?: number; seed?: number } = {}): Character {
  const rng = seededRng(opts.seed ?? 7);
  const input = guideInput(classId, subclassId, { id: opts.ancestry ?? 'human' }, opts.community ?? 'loreborne', rng);
  let ch = createCharacter(input);
  while (ch.level < (opts.level ?? 1)) ch = applyLevelUp(ch, randomLevelUp(ch, rng)!);
  return ch;
}

describe('class resources and states', () => {
  it('Favor starts at 3; Focus at 0; controls read "spend a Favor"', () => {
    const w = make('warlock', 'pact-of-the-endless');
    expect(w.uses['res:favor']).toBeUndefined();
    const keys = customControls(w, 'class:favor', []).map((c) => c.kind);
    expect(keys).toEqual(['resource']);
    const mantle = controlsFor('**Spend a Favor** to cloak yourself.');
    expect(mantle).toEqual([{ kind: 'spend', cost: { res: 'favor', n: 1 }, label: 'Spend 1 Favor' }]);
  });

  it('Patron’s Mantle adds your tier to both thresholds; Patron’s Fury adds tier Patron Dice', () => {
    const w = make('warlock', 'pact-of-the-endless', { level: 5 });
    const base = derive(w).thresholds;
    const on = setActive(w, 'sub:patrons-mantle', true);
    expect(derive(on).thresholds).toEqual({ major: base.major + 3, severe: base.severe + 3 });
    const f = make('warlock', 'pact-of-the-wrathful', { level: 5 });
    expect(ACTIVE['sub:patrons-fury'].damageDice!(activeCtx(f, 'sub:patrons-fury'))).toEqual([{ count: 3, sides: 8 }]);
  });

  it('one martial stance at a time; Anchored +2 thresholds, Reliable +1 attack, Aggressive −1 Evasion', () => {
    const m = make('brawler', 'martial-artist');
    const d0 = derive(m);
    let c = setActive(m, 'stance:anchored', true);
    expect(derive(c).thresholds.major).toBe(d0.thresholds.major + 2);
    c = setActive(c, 'stance:reliable', true);
    expect(isActive(c, 'stance:anchored')).toBe(false);
    expect(derive(c).attackBonus).toBe(d0.attackBonus + 1);
    c = setActive(c, 'stance:aggressive', true);
    expect(derive(c).evasion).toBe(d0.evasion - 1);
    expect(isActive(endScene(c), 'stance:aggressive')).toBe(false);
  });

  it('Favored stance adds the chosen trait to damage', () => {
    const m = make('brawler', 'martial-artist');
    const c = setActive(m, 'stance:favored', true, ['strength']);
    expect(derive(c).modifiers.filter((x) => x.stat === 'damage').reduce((s, x) => s + x.value, 0)).toBe(derive(m).traits.strength);
  });

  it('Channel Earth adds Proficiency to thresholds; Dominion Air adds +1 Evasion', () => {
    const d = make('druid', 'warden-of-the-elements', { level: 8, seed: 3 });
    const t = derive(d).thresholds;
    const earth = setActive(d, 'sub:elemental-incarnation', true, ['earth']);
    expect(derive(earth).thresholds.major).toBe(t.major + derive(d).proficiency);
    const air = setActive({ ...d, subclassStage: 'mastery' }, 'sub:elemental-incarnation', true, ['air']);
    expect(derive(air).evasion).toBe(derive({ ...d, subclassStage: 'mastery' }).evasion + 1);
    expect(isActive(rest(earth, 'short', []).character, 'sub:elemental-incarnation')).toBe(false);
  });

  it('Transcendence gives the two chosen benefits until a rest', () => {
    const s = { ...make('sorcerer', 'elemental-origin', { level: 8 }), subclassStage: 'mastery' as const };
    const d0 = derive(s);
    const t = setActive(s, 'sub:transcendence', true, ['evasion', 'proficiency']);
    expect(derive(t).evasion).toBe(d0.evasion + 2);
    expect(derive(t).proficiency).toBe(Math.min(6, d0.proficiency + 1));
  });

  it('Conjure Shield adds Proficiency to Evasion only with 2+ Hope', () => {
    const w = { ...make('wizard', 'school-of-war', { level: 5 }), subclassStage: 'specialization' as const };
    expect(derive({ ...w, hope: 2 }).evasion).toBe(derive({ ...w, hope: 1 }).evasion + derive(w).proficiency);
  });

  it('a new session rolls Prayer Dice (Spellcast d4s) and the Lunar die; Luckbringer gives a Hope', () => {
    const s = make('seraph', 'divine-wielder');
    const n = newSession(s, seededRng(1));
    expect(n.heldDice?.prayer?.length).toBe(Math.max(0, derive(s).spellcast ?? 0));
    for (const v of n.heldDice?.prayer ?? []) expect(v).toBeGreaterThanOrEqual(1);
    const moon = { ...make('witch', 'moon', { level: 8 }), subclassStage: 'mastery' as const };
    const m = newSession(moon, seededRng(2));
    expect(m.uses['session:phase:sub:lunar-phases']).toBeGreaterThanOrEqual(1);
    const h = make('bard', 'troubadour', { ancestry: 'halfling' });
    expect(newSession({ ...h, hope: 1 }).hope).toBe(2);
  });

  it('Lunar Phases: Full +3 thresholds, Waning +1 Evasion, Waxing +2 damage', () => {
    const moon = { ...make('witch', 'moon', { level: 8 }), subclassStage: 'mastery' as const };
    const at = (v: number) => derive({ ...moon, uses: { ...moon.uses, 'session:phase:sub:lunar-phases': v } });
    expect(at(4).thresholds.major).toBe(derive(moon).thresholds.major + 3);
    expect(at(5).evasion).toBe(derive(moon).evasion + 1);
    expect(at(2).modifiers.some((x) => x.stat === 'damage' && x.value === 2)).toBe(true);
  });

  it('Frostborne clears a Hit Point at every rest; Know the Tide tokens clear at a new session', () => {
    const f = { ...make('guardian', 'stalwart', { community: 'frostborne' }), hp: 3 };
    expect(rest(f, 'short', []).character.hp).toBe(2);
    const sea = make('rogue', 'syndicate', { community: 'seaborne' });
    expect(newSession({ ...sea, uses: { 'tokens:com:know-the-tide': 1 } }).uses['tokens:com:know-the-tide']).toBeUndefined();
  });

  it('End scene ends the Unstoppable Die and scene uses, not long-rest uses', () => {
    const g = make('guardian', 'stalwart');
    const c = endScene({ ...g, uses: { 'die:damage:4:class:unstoppable': 3, 'longRest:class:unstoppable': 1, 'scene:anc:flicker-step': 1 } });
    expect(c.uses).toEqual({ 'longRest:class:unstoppable': 1 });
  });

  it('Marked for Death grows to d6s with Ambush and d8s with Backstab', () => {
    const a = make('assassin', 'executioners-guild');
    const label = (c: Character) => (customControls(c, 'class:marked-for-death', [])[0] as Extract<Control, { kind: 'arm' }>).effect;
    expect(label(a)).toEqual({ damageDice: { count: 'tier', sides: 6 } });
    expect(label({ ...a, subclassStage: 'mastery', level: 8 })).toEqual({ damageDice: { count: 'tier', sides: 8 } });
    expect(label(make('assassin', 'poisoners-guild'))).toEqual({ damageDice: { count: 'tier', sides: 4 } });
  });
});

describe('transformations', () => {
  it('Demigod: +1 to action and damage rolls', () => {
    const d = derive({ ...make('warrior', 'call-of-the-brave'), transformation: 'demigod' });
    expect(d.actionBonus).toBe(1);
    expect(d.modifiers.some((m) => m.source === 'Gifted' && m.stat === 'damage')).toBe(true);
  });

  it('their features join the features in effect, keyed tf:', () => {
    for (const t of transformations) {
      const ch = { ...make('rogue', 'nightwalker'), transformation: t.id };
      expect(inEffect(ch).filter((e) => e.key.startsWith('tf:')).map((e) => e.name)).toEqual(t.features.map((f) => f.name));
    }
  });

  it('Vampire: no Feed tokens means disadvantage; a long rest removes a token', () => {
    const v = { ...make('rogue', 'nightwalker'), transformation: 'vampire' };
    expect(starving(v)).toBe(true);
    const fed = { ...v, uses: { 'tokens:tf:feed': 2 } };
    expect(starving(fed)).toBe(false);
    expect(rest(fed, 'long', []).character.uses['tokens:tf:feed']).toBe(1);
  });

  it('Shapeshifter: only one ancestry feature works (Giant Endurance only if chosen)', () => {
    const base = make('guardian', 'stalwart', { ancestry: 'giant' });
    const shift = { ...base, transformation: 'shapeshifter' };
    // Giant features: Endurance (first, default) and Reach.
    expect(derive(shift).hitPoints).toBe(derive(base).hitPoints);
    const reach = { ...shift, picks: { ...shift.picks, shapeshifter: 'reach' } };
    expect(derive(reach).hitPoints).toBe(derive(base).hitPoints - 1);
  });

  it('Werewolf Wolf Form adds a d10 to attack and damage and ends at a rest', () => {
    const w = setActive({ ...make('warrior', 'call-of-the-slayer'), transformation: 'werewolf' }, 'tf:wolf-form', true);
    const ctx = activeCtx(w, 'tf:wolf-form');
    expect(ACTIVE['tf:wolf-form'].attackDice!(ctx)).toEqual([{ count: 1, sides: 10 }]);
    expect(isActive(rest(w, 'short', []).character, 'tf:wolf-form')).toBe(false);
  });
});

describe('Beastbound companion', () => {
  it('starts at Evasion 10, 3 Stress, d6 Melee, two Experiences at +2', () => {
    const r = { ...make('ranger', 'beastbound'), companion: newCompanion() };
    const st = companionStats(r);
    expect([st.evasion, st.stressSlots, st.damageDie, st.range, st.experiences.map((e) => e.value)]).toEqual([10, 3, 6, 'Melee', [2, 2]]);
    expect(st.allowed).toBe(0);
  });

  it('training: Aware ×2, Resilient, Vicious die and range, Intelligent on a chosen Experience', () => {
    const r = make('ranger', 'beastbound', { level: 6 });
    const picks: CompanionPick[] = [
      { option: 'aware', level: 2 }, { option: 'aware', level: 3 }, { option: 'resilient', level: 4 },
      { option: 'vicious', level: 5, vicious: 'damage' }, { option: 'vicious', level: 6, vicious: 'range' }, { option: 'intelligent', level: 6, experience: 1 },
    ];
    const st = companionStats({ ...r, companion: { ...newCompanion(), picks } });
    expect([st.evasion, st.stressSlots, st.damageDie, st.range]).toEqual([14, 4, 8, 'Very Close']);
    expect(st.experiences[1].value).toBe(3);
    expect(st.experiences[0].value).toBe(2);
  });

  it('one pick a level after 1; Expert Training +1, Advanced Training +2; Light in the Dark adds a Hope slot', () => {
    const r = make('ranger', 'beastbound', { level: 5 });
    expect(trainingAllowed(r, 5, 'foundation')).toBe(4);
    expect(trainingAllowed(r, 5, 'specialization')).toBe(5);
    expect(trainingAllowed(r, 8, 'mastery')).toBe(10);
    const light = { ...r, companion: { ...newCompanion(), picks: [{ option: 'light-in-the-dark', level: 2 }] } };
    expect(derive(light).hopeSlots).toBe(derive(r).hopeSlots + 1);
  });

  it('downtime moves that clear your Stress clear the companion’s too', () => {
    const r = { ...make('ranger', 'beastbound'), stress: 0, companion: { ...newCompanion(), stress: 3 } };
    expect(rest(r, 'long', [{ id: 'clear-all-stress' }]).character.companion!.stress).toBe(0);
  });
});

describe('items', () => {
  const carry = (ch: Character, ...ids: string[]): Character => ({ ...ch, items: ids.map((id) => ({ id, qty: 1 })) });

  it('a relic gives +1 to its trait; only the first relic counts', () => {
    const g = make('guardian', 'stalwart');
    expect(derive(carry(g, 'bolster-relic')).traits.strength).toBe(derive(g).traits.strength + 1);
    const two = derive(carry(g, 'bolster-relic', 'stride-relic'));
    expect(two.traits.agility).toBe(derive(g).traits.agility);
  });

  it('a gem changes the primary weapon’s attack trait; Greatstone and Bloodstone only on featureless weapons', () => {
    const g = make('guardian', 'stalwart');
    expect(attackProfile(carry(g, 'gem-of-sagacity'), 'primary')!.trait).toBe('knowledge');
    const featureless = { ...g, primary: { id: 'broadsword' } };
    // Broadsword has Reliable, so the stones do nothing.
    expect(attackProfile(carry(featureless, 'greatstone'), 'primary')!.extraDieDropLowest).toBe(false);
    const plain = { ...g, primary: { id: 'longsword' } };
    expect(attackProfile(carry(plain, 'greatstone'), 'primary')!.extraDieDropLowest).toBe(true);
    expect(attackProfile(carry(plain, 'bloodstone'), 'primary')!.brutal).toBe(true);
  });

  it('Brutal rolls another die for each maximum', () => {
    let extra = 0;
    for (let i = 0; i < 200; i++) {
      const r = damageRoll({ dice: [{ count: 2, sides: 4 }], bonus: 0, brutal: true }, seededRng(i));
      const v = r.rolls[0].values;
      expect(v.length).toBe(2 + v.filter((x) => x === 4).length - (v[v.length - 1] === 4 ? 1 : 0));
      extra += v.length - 2;
    }
    expect(extra).toBeGreaterThan(0);
  });

  it('Premium Bedroll clears a Stress at a rest; Timekeeper’s Pendant adds a downtime move', () => {
    const g = { ...make('guardian', 'stalwart'), stress: 2 };
    expect(rest(carry(g, 'premium-bedroll'), 'short', []).character.stress).toBe(1);
    expect(moveLimit(carry(g, 'timekeepers-pendant'))).toBe(moveLimit(g) + 1);
  });

  it('Insomniac’s Periapt: a rest without clearing gives +2 attack and damage until the next rest', () => {
    const g = carry(make('warrior', 'call-of-the-brave'), 'insomniacs-periapt');
    const r = rest(g, 'short', [{ id: 'repair-armor' }]).character;
    expect(isActive(r, 'item:insomniacs-periapt')).toBe(true);
    expect(isActive(rest(r, 'short', [{ id: 'clear-stress' }]).character, 'item:insomniacs-periapt')).toBe(false);
  });

  it('every consumable effect switches on and ends when it says', () => {
    const g = make('wizard', 'school-of-war', { level: 5 });
    for (const [id, u] of Object.entries(ITEM_USE)) {
      if (!('active' in u)) continue;
      expect(lootById.get(id), id).toBeTruthy();
      const on = setActive(g, u.active, true);
      expect(BAD(on), id).toEqual([]);
      if (ACTIVE[u.active].ends === 'rest') expect(isActive(rest(on, 'short', []).character, u.active)).toBe(false);
      if (ACTIVE[u.active].ends === 'scene') expect(isActive(endScene(on), u.active)).toBe(false);
    }
    expect(derive(setActive(g, 'item:major-stride-potion', true)).traits.agility).toBe(derive(g).traits.agility + 1);
  });

  it('every ITEM_USE id is a real loot item', () => {
    for (const id of Object.keys(ITEM_USE)) expect(lootById.get(id), id).toBeTruthy();
  });
});

// ---- The sweep -------------------------------------------------------------

const BAD = (ch: Character): string[] => {
  const d = derive(ch);
  const p: string[] = [];
  if (!(d.hitPoints >= 1)) p.push(`hit points ${d.hitPoints}`);
  if (d.proficiency < 1 || d.proficiency > 6) p.push(`proficiency ${d.proficiency}`);
  if (!Number.isFinite(d.evasion)) p.push('evasion not a number');
  if (d.thresholds.major > d.thresholds.severe) p.push(`major ${d.thresholds.major} > severe ${d.thresholds.severe}`);
  for (const [k, v] of Object.entries(ch.uses)) if (!(v >= 0)) p.push(`use ${k} = ${v}`);
  for (const r of ['focus', 'favor']) { const v = ch.uses[`res:${r}`]; if (v !== undefined && (v < 0 || v > 6)) p.push(`${r} ${v}`); }
  return p;
};

/** Every control a feature shows must be complete: labels, dice with sides, costs that can be paid. */
function controlProblems(ch: Character): string[] {
  const p: string[] = [];
  for (const e of inEffect(ch)) {
    for (const c of customControls(ch, e.key, controlsFor(e.text))) {
      if (!c.label) p.push(`${e.key}: ${c.kind} without a label`);
      if (c.kind === 'arm' && 'damageDice' in c.effect && !((c.effect.damageDice?.sides ?? 0) > 0)) p.push(`${e.key}: arm with no die`);
      if ((c.kind === 'dice' || c.kind === 'damage') && !(c.sides > 0)) p.push(`${e.key}: dice with no sides`);
      if (c.kind === 'arm' && c.cost && 'stress' in c.cost && c.cost.stress < 1) p.push(`${e.key}: arm with a 0 cost`);
    }
  }
  return p;
}

function switchEverythingOn(ch: Character, rng: Rng): Character {
  let c = ch;
  const keys = new Set([...inEffect(ch).map((e) => e.key.replace(/^mcsub:/, 'sub:')), ...Object.keys(ACTIVE).filter((k) => k.startsWith('stance:') || k.startsWith('item:'))]);
  for (const k of keys) {
    const def = ACTIVE[k];
    if (!def) continue;
    const opts = def.options ? [pick(rng, def.options).id, ...(def.pick && def.pick > 1 ? [def.options.find((o) => !o.set)!.id] : [])] : undefined;
    c = setActive(c, k, true, opts);
    if (def.tokens) c = { ...c, uses: { ...c.uses, [`tokens:${k}`]: def.tokens(activeCtx(c, k)) } };
  }
  return c;
}

describe('break-it sweep: every class, subclass and transformation, levels 1–10, everything switched on', () => {
  it('stays legal through scenes, sessions and rests', () => {
    const failures: string[] = [];
    let runs = 0;
    const tfs = [undefined, ...transformations.map((t) => t.id)];
    for (const cls of classes) {
      for (const sub of cls.subclasses) {
        for (const tf of tfs) {
          for (let k = 0; k < 4; k++) {
            const label = `${cls.id}/${sub.id}/${tf ?? '-'}/${k}`;
            const rng = seededRng(runs + 1);
            const anc = pick(rng, ancestries).id;
            const com = pick(rng, communities).id;
            const input = guideInput(cls.id, sub.id, { id: anc }, com, rng);
            if (creationProblems(input).length) continue;
            let ch: Character = { ...createCharacter(input), transformation: tf, items: [pick(rng, loot), pick(rng, loot), pick(rng, loot)].map((x) => ({ id: x.id, qty: 1 })) };
            try {
              while (true) {
                runs++;
                const fail = (m: string) => failures.push(`${label} ${anc}/${com} L${ch.level}: ${m}`);
                controlProblems(ch).forEach(fail);
                let on = switchEverythingOn({ ...ch, hope: Math.floor(rng() * 7), hp: Math.floor(rng() * 3), stress: Math.floor(rng() * 3) }, rng);
                BAD(on).forEach(fail);
                on = endScene(on);
                if ((on.active ?? []).some((x) => ACTIVE[x]?.ends === 'scene')) fail('a scene effect survived End scene');
                on = newSession(on, rng);
                BAD(on).forEach(fail);
                on = rest(on, 'short', [{ id: 'clear-stress' }], rng).character;
                if ((on.active ?? []).some((x) => ACTIVE[x]?.ends === 'rest')) fail('a rest effect survived a rest');
                on = rest(on, 'long', [{ id: 'tend-to-all-wounds' }, { id: 'clear-all-stress' }], rng).character;
                if ((on.active ?? []).some((x) => ['rest', 'longRest', 'scene'].includes(ACTIVE[x]?.ends ?? ''))) fail('an effect survived a long rest');
                BAD(on).forEach(fail);
                if (ch.level >= 10) break;
                const choices = randomLevelUp(ch, rng);
                if (!choices) { fail('no level-up'); break; }
                ch = applyLevelUp(ch, choices);
              }
            } catch (e) {
              failures.push(`${label} L${ch.level}: threw ${(e as Error).message}`);
            }
          }
        }
      }
    }
    expect(failures.slice(0, 30)).toEqual([]);
    expect(runs).toBeGreaterThan(7000);
  }, 600_000);
});
