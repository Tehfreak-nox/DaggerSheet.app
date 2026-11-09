import { useEffect, useState } from 'react';
import {
  addDamageDice, addDieToRoll, addToDamage, addToRoll, applyFromResult, closeRoll, comboStrike, doubleDamageDie, doubleDamageTotal,
  lastFearDie, makeItCritical, makeItHope, maxOneDamageDie, onesToMax, pay, rerollDamage, rerollDuality, rerollFearDie, rerollHopeDie, resourceOf,
  spendHeld, swapDuality, takePoolDie, toggleArm, usePlay, withGain, type RollView,
} from '../app/play';
import { updateCharacter, useStore } from '../app/store';
import { FEED_KEY, controlsFor, derive, hasFeature, inEffect, isActive, rollMany, setActive, strip, type Character, type InEffect } from '../rules';
import { signed } from './kit';

function useTumble(active: boolean, sides: number) {
  const [n, setN] = useState(1);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN(1 + Math.floor(Math.random() * sides)), 70);
    return () => clearInterval(t);
  }, [active, sides]);
  return n;
}

function Die({ value, sides, rolling, fear, small, dropped, picked, onPick }: {
  value: number; sides: number; rolling: boolean; fear?: boolean; small?: boolean; dropped?: boolean; picked?: boolean; onPick?: () => void;
}) {
  const t = useTumble(rolling, sides);
  const cls = `s-die ${fear ? 'fear' : ''} ${small ? 'sm' : ''} d${sides} ${rolling ? 's-spin' : ''} ${picked ? 'picked' : ''}`;
  if (onPick) {
    return (
      <button className={cls} style={{ border: 0, padding: 0 }} aria-pressed={!!picked} aria-label={`d${sides} showing ${value}${picked ? ', selected to reroll' : ''}`} onClick={onPick}>
        <span>{value}</span>
      </button>
    );
  }
  return (
    <div className={cls} style={dropped ? { opacity: 0.35 } : undefined}>
      <span>{rolling ? t : value}</span>
    </div>
  );
}

const key = (g: number, i: number) => `${g}:${i}`;

/** Uses tracked by a feature's own text ("Once per rest"): key and how many are left. */
function usesLeft(ch: Character, e: InEffect): { useKey?: string; left: number } {
  const m = /\b(once|twice|three times) per (long rest|short rest|rest|session|scene)\b/i.exec(strip(e.text));
  if (!m) return { left: 99 };
  const max = /once/i.test(m[1]) ? 1 : /twice/i.test(m[1]) ? 2 : 3;
  const scope = /long rest/i.test(m[2]) ? 'longRest' : /session/i.test(m[2]) ? 'session' : /scene/i.test(m[2]) ? 'scene' : 'rest';
  const useKey = `${scope}:${e.key}`;
  return { useKey, left: max - (ch.uses[useKey] ?? 0) };
}

/** Reroll and follow-up buttons the character's features and cards offer on this result. */
function Followups({ r, ch, picked, setPicked, picking, setPicking }: {
  r: RollView; ch?: Character; picked: Set<string>; setPicked: (s: Set<string>) => void; picking: boolean; setPicking: (b: boolean) => void;
}) {
  if (!ch || r.kind === 'dice') return null;
  const out: React.ReactNode[] = [];
  const used = (l: string) => r.rerolled.includes(l);
  const btn = (key: string, label: string, onClick: () => void, opts: { disabled?: boolean; solid?: boolean } = {}) =>
    out.push(<button key={key} className={`s-btn s-press ${opts.solid ? 'solid' : ''}`} disabled={opts.disabled} onClick={onClick}>{label}</button>);
  const effects = inEffect(ch).map((e) => ({ ...e, t: strip(e.text) }));
  const n = (w: string) => ({ a: 1, an: 1, one: 1, two: 2, three: 3 } as Record<string, number>)[w.toLowerCase()] ?? Number(w);

  if (r.kind === 'action') {
    const x = r.result;
    const fear = x.outcome === 'fear' && !r.reaction;
    const crit = x.outcome === 'critical';
    for (const e of effects) {
      const u = usesLeft(ch, e);
      const spent = u.left <= 0 || used(e.name);
      let m: RegExpExecArray | null;
      if (/When you roll a 1 on your Hope Die, you can reroll it/i.test(e.t) && x.hope === 1 && !spent) {
        btn(e.key, `Reroll your 1 · ${e.name}`, () => rerollHopeDie(e.name));
      }
      if ((m = /When you make an? (\w+) Roll, you can spend (\w+) Hope to reroll your Hope Die/i.exec(e.t)) && r.trait === m[1].toLowerCase() && !spent) {
        const cost = n(m[2]);
        btn(e.key, `Reroll Hope Die · ${cost} Hope (${e.name})`, () => rerollHopeDie(e.name, cost), { disabled: ch.hope < cost });
      }
      if (fear && !spent && !/\ban ally\b[^.]*rolls with Fear/i.test(e.t)
        && (m = /roll with Fear[^.]*?, you can (?:mark (\w+) Stress to )?(?:change it into a roll with Hope|roll with Hope instead)/i.exec(e.t))) {
        const cost = m[1] ? { stress: n(m[1]) } : undefined;
        btn(e.key, `Make it a roll with Hope${cost ? ` · ${cost.stress} Stress` : ''} (${e.name})`, () => makeItHope(e.name, cost, u.useKey));
      }
      if (/spend 3 Hope to reroll the Duality Dice/i.test(e.t) && !spent) {
        btn(e.key, `Reroll the Duality Dice · 3 Hope (${e.name})`, () => rerollDuality(e.name, { hope: 3 }, u.useKey), { disabled: ch.hope < 3 });
      }
      if (/spend a Hope to reroll the Hope or Fear Die/i.test(e.t) && !spent) {
        btn(`${e.key}-h`, `Reroll Hope Die · 1 Hope (${e.name})`, () => rerollHopeDie(e.name, 1), { disabled: ch.hope < 1 });
        btn(`${e.key}-f`, `Reroll Fear Die · 1 Hope (${e.name})`, () => rerollFearDie(e.name, { hope: 1 }), { disabled: ch.hope < 1 });
      }
      if ((m = /After you make an action roll[^.]*, you can spend a Hope to add a d(\d+) to the roll/i.exec(e.t)) && !spent) {
        const sides = Number(m[1]);
        btn(e.key, `Add a d${sides} · 1 Hope (${e.name})`, () => addDieToRoll(e.name, sides, { hope: 1 }), { disabled: ch.hope < 1 });
      }
      if (/When you fail a roll, you can spend 3 Hope to reroll with advantage/i.test(e.t) && !spent) {
        btn(e.key, `Failed? Reroll with advantage · 3 Hope (${e.name})`, () => rerollDuality(e.name, { hope: 3 }, undefined, true), { disabled: ch.hope < 3 });
      }
      if (/fail a roll that utilized one of your Experiences, you can mark a Stress to reroll/i.test(e.t) && r.experience && !spent) {
        btn(e.key, `Failed? Reroll · 1 Stress (${e.name})`, () => rerollDuality(e.name, { stress: 1 }));
      }
      if ((/you can switch the results of your Hope and Fear Dice/i.test(e.t) || (r.attack && /you can swap the results of your Hope and Fear Dice/i.test(e.t))) && !spent && x.hope !== x.fear) {
        btn(e.key, `Swap Hope and Fear (${e.name})`, () => swapDuality(e.name, u.useKey));
      }
      if (r.attack && r.damageFn && /When you fail an attack, you can mark a Stress to deal weapon damage using half your Proficiency/i.test(e.t) && !crit && !spent) {
        btn(e.key, `Missed? ${e.name} · 1 Stress, half damage`, () => { if (pay(ch.id, { stress: 1 })) { closeRoll(); r.damageFn!({ halfProf: true }); } });
      }
      if (r.attack && crit && /When you critically succeed on a weapon attack, gain an additional Hope or clear an additional Stress/i.test(e.t) && !used(e.name)) {
        btn(`${e.key}-h`, `${e.name} · +1 Hope`, () => applyFromResult(e.name, (c) => ({ ...c, hope: Math.min(derive(c).hopeSlots, c.hope + 1) }), undefined, `${e.name}: +1 Hope.`));
        btn(`${e.key}-s`, `${e.name} · clear a Stress`, () => applyFromResult(e.name, (c) => ({ ...c, stress: Math.max(0, c.stress - 1) }), undefined, `${e.name}: cleared a Stress.`));
      }
      if (r.attack && crit && /When you critically succeed on a Melee weapon attack, you gain an additional Hope, clear an additional Stress/i.test(e.t) && !used(e.name)) {
        btn(e.key, `${e.name} · +1 Hope, clear a Stress`, () => applyFromResult(e.name, (c) => ({ ...c, hope: Math.min(derive(c).hopeSlots, c.hope + 1), stress: Math.max(0, c.stress - 1) }), undefined, `${e.name}: +1 Hope, cleared a Stress (and +1 Proficiency on this damage).`));
      }
      if (r.attack && crit && /When you critically succeed on an attack, you can spend up to 3 Hope/i.test(e.t)) {
        const opt = (k: string, label: string, fn: (c: Character) => Character) => {
          const l = `${e.name}: ${label}`;
          if (!used(l)) btn(`${e.key}-${k}`, `${label} · 1 Hope`, () => applyFromResult(l, fn, { hope: 1 }, `${l}.`), { disabled: ch.hope < 1 });
        };
        opt('hp', 'Clear a Hit Point', (c) => ({ ...c, hp: Math.max(0, c.hp - 1) }));
        opt('ar', 'Clear an Armor Slot', (c) => ({ ...c, armorMarked: Math.max(0, c.armorMarked - 1) }));
        opt('tg', 'Target marks +1 HP', (c) => c);
      }
    }
    const has = (id: string) => hasFeature(ch, id);
    if (r.critOffer && !crit) btn('homet', 'Hit? Make it a critical (Homet’s Secret Potion)', () => makeItCritical('Homet’s Secret Potion'), { solid: true });
    // Strange Patterns: your number on a Duality Die gives a Hope or clears a Stress.
    const sp = ch.picks.strangePatterns;
    if (sp && has('strange-patterns') && (x.hope === sp || x.fear === sp) && !used('Strange Patterns')) {
      btn('sp-h', `Strange Patterns (${sp}) · +1 Hope`, () => applyFromResult('Strange Patterns', (c) => withGain(c, { hope: 1 }), undefined, 'Strange Patterns: +1 Hope.'), { solid: true });
      btn('sp-s', `Strange Patterns (${sp}) · clear a Stress`, () => applyFromResult('Strange Patterns', (c) => withGain(c, { stress: 1 }), undefined, 'Strange Patterns: cleared a Stress.'));
    }
    // Favor: "when you succeed on an action roll with Hope, you can choose to gain a Favor instead of a Hope."
    if (has('favor') && r.applied.hope > 0 && !used('Favor') && resourceOf(ch, 'favor') < 6) {
      btn('favor', 'Succeeded? Take a Favor instead of the Hope', () => applyFromResult('Favor', (c) => withGain({ ...c, hope: Math.max(0, c.hope - 1) }, { res: { res: 'favor', n: 1 } }), undefined, 'Took a Favor instead of a Hope.'));
    }
    // Courage: "When you fail a roll with Fear, you gain a Hope."
    if (has('courage') && fear && !used('Courage')) btn('courage', 'Failed? Courage · +1 Hope', () => applyFromResult('Courage', (c) => withGain(c, { hope: 1 }), undefined, 'Courage: +1 Hope.'));
    // Demigod: "When you fail a roll, you must mark a Stress or the GM gains a Fear."
    if (ch.transformation === 'demigod' && !used('Weight of Divinity')) btn('wod', 'Failed? Weight of Divinity · mark a Stress (or the GM gains a Fear)', () => applyFromResult('Weight of Divinity', (c) => c, { stress: 1 }, 'Weight of Divinity: marked a Stress.'));
    // True Strike: once per long rest, a failed attack becomes a success for a Hope.
    if (r.attack && has('true-strike') && (ch.uses['longRest:sub:true-strike'] ?? 0) < 1 && !used('True Strike')) {
      btn('ts', 'Missed? True Strike · 1 Hope, it hits', () => applyFromResult('True Strike', (c) => ({ ...c, uses: { ...c.uses, 'longRest:sub:true-strike': 1 } }), { hope: 1 }, 'True Strike: the attack succeeds.'));
    }
    // Manipulate Magic: after a spell or a magic attack, mark a Stress for +2.
    if (has('manipulate-magic') && !used('Manipulate Magic')) btn('mm', 'Spell or magic attack? +2 · 1 Stress (Manipulate Magic)', () => addToRoll('Manipulate Magic', 2, { stress: 1 }));
    // Martial stance Invigorating: on a successful attack, a d4; on a 4, gain a Focus.
    if (r.attack && isActive(ch, 'stance:invigorating') && !used('Invigorating')) {
      btn('inv', 'Hit? Invigorating · roll a d4', () => { const v = rollMany(1, 4)[0]; applyFromResult('Invigorating', (c) => (v === 4 ? withGain(c, { res: { res: 'focus', n: 1 } }) : c), undefined, `Invigorating: d4 = ${v}${v === 4 ? ', +1 Focus.' : '.'}`); });
    }
    // Face Your Fear: "When you succeed with Fear on an attack roll, you deal an extra 1d10 magic damage" (2d10, 3d10).
    if (r.attack && fear && has('face-your-fear') && !used('Face Your Fear')) {
      const n = has('have-no-fear') ? 3 : has('fueled-by-fear') ? 2 : 1;
      btn('fyf', `Hit? Face Your Fear · +${n}d10 magic on the damage`, () => { toggleArm(ch.id, { key: 'sub:face-your-fear', label: `Face Your Fear +${n}d10`, effect: { damageDice: { count: n, sides: 10 } } }); applyFromResult('Face Your Fear', (c) => c, undefined, `Face Your Fear: +${n}d10 armed for the damage.`); });
    }
    // Prayer Dice: add one to this roll.
    (ch.heldDice?.prayer ?? []).forEach((v, i) => {
      btn(`pd${i}`, `Prayer Die · +${v}`, () => { spendHeld(ch.id, 'prayer', i); addToRoll('Prayer Die', v); });
    });
    // A pool of dice gained instead of a Hope (Slayer Dice).
    if ((x.outcome === 'hope' || crit) && !r.reaction) {
      for (const e of effects) {
        const pool = controlsFor(e.text).find((c) => c.kind === 'dicePool');
        if (!pool || pool.kind !== 'dicePool' || used(pool.name)) continue;
        const poolKey = `pool:${e.key}`;
        const max = derive(ch).proficiency;
        const have = ch.uses[poolKey] ?? 0;
        if (have < max) btn(`${e.key}-pool`, `Take a ${pool.name.replace(/ Dice$/, ' Die')} instead of a Hope (${have}/${max})`, () => takePoolDie(pool.name, poolKey, max));
      }
    }
    if (r.damageFn && crit) btn('cd', 'Roll critical damage', () => { closeRoll(); r.damageFn!({ critical: true }); }, { solid: true });
  } else if (r.kind === 'damage') {
    const ones = r.result.rolls.reduce((k, g) => k + g.values.filter((v) => v === 1).length, 0);
    const has = (id: string) => hasFeature(ch, id);
    if (r.attack) {
      // Combo Strike: mark a Stress (or spend a Focus with Flow State) after rolling damage with a Melee weapon.
      if (has('combo-strike') && !used('Combo Strike')) {
        const sides = ch.picks.comboDie ?? 4;
        btn('combo', `Melee hit? Combo Strike · d${sides} · 1 Stress`, () => comboStrike('Combo Strike', sides, { stress: 1 }), { solid: true });
        if (has('flow-state')) btn('combo-f', `Combo Strike · d${sides} · 1 Focus`, () => comboStrike('Combo Strike', sides, { res: 'focus', n: 1 }), { disabled: resourceOf(ch, 'focus') < 1 });
      }
      // First Strike: "The first time in a scene you succeed on an attack, you deal double damage."
      if (has('first-strike') && (ch.uses['scene:sub:first-strike'] ?? 0) < 1 && !used('First Strike')) btn('fs', 'First hit this scene? First Strike · double', () => doubleDamageTotal('First Strike', 'scene:sub:first-strike'));
      // Exacting stance: 1s count as the highest value.
      if (isActive(ch, 'stance:exacting') && ones && !used('Exacting')) btn('ex', `Exacting · ${ones === 1 ? 'your 1 counts' : `${ones} 1s count`} as max`, () => onesToMax('Exacting'));
      // Arcane Charge: clear your Charge for +10 on a magic attack.
      if (r.magic && isActive(ch, 'sub:arcane-charge') && !used('Arcane Charge')) btn('ac', 'Clear your Charge · +10 damage', () => { addToDamage('Arcane Charge', 10); updateCharacter(ch.id, (c) => setActive(c, 'sub:arcane-charge', false)); });
      // Manipulate Magic: double a damage die for a Stress.
      if (r.magic && has('manipulate-magic') && !used('Manipulate Magic')) btn('mmd', 'Double your highest die · 1 Stress (Manipulate Magic)', () => doubleDamageDie('Manipulate Magic', { stress: 1 }));
      // Vampire Feed: tokens equal to the Hit Points the target marks.
      if (ch.transformation === 'vampire' && /Fangs/.test(r.title) && !used('Feed')) {
        for (const n of [1, 2, 3]) btn(`feed${n}`, `Feed · ${n} HP marked · 1 Stress`, () => applyFromResult('Feed', (c) => ({ ...c, uses: { ...c.uses, [FEED_KEY]: Math.min(6, (c.uses[FEED_KEY] ?? 0) + n) } }), { stress: 1 }, `Feed: +${n} token${n > 1 ? 's' : ''}.`));
      }
    }
    // Prayer Dice: add one to this damage roll.
    (ch.heldDice?.prayer ?? []).forEach((v, i) => {
      btn(`pd${i}`, `Prayer Die · +${v}`, () => { spendHeld(ch.id, 'prayer', i); addToRoll('Prayer Die', v); });
    });
    // Fearsome Attack: spend a Favor to reroll any number of damage dice, again and again.
    if (has('fearsome-attack') && r.attack) {
      if (!picking) btn('fa', 'Fearsome Attack · reroll dice for 1 Favor', () => setPicking(true), { disabled: resourceOf(ch, 'favor') < 1 });
      else {
        out.push(
          <span key="fa-hint" className="s-muted" style={{ fontSize: 14, textAlign: 'center' }}>Tap the dice to reroll.</span>,
          <span key="fa" style={{ display: 'flex', gap: 8 }}>
            <button className="s-btn s-press" style={{ flex: 1 }} onClick={() => { setPicking(false); setPicked(new Set()); }}>Cancel</button>
            <button className="s-btn solid s-press" style={{ flex: 2 }} disabled={!picked.size || resourceOf(ch, 'favor') < 1}
              onClick={() => { const p = new Set(picked); setPicking(false); setPicked(new Set()); if (pay(ch.id, { res: 'favor', n: 1 })) rerollDamage('Fearsome Attack', (_, g, i) => p.has(key(g, i))); }}>
              Reroll {picked.size || ''} · 1 Favor
            </button>
          </span>,
        );
      }
    }
    for (const e of effects) {
      const spent = usesLeft(ch, e).left <= 0 || used(e.name);
      let m: RegExpExecArray | null;
      if (/When you roll your damage dice, you can reroll any 1s or 2s/i.test(e.t) && !spent && r.result.rolls.some((g) => g.values.some((v) => v <= 2))) {
        btn(e.key, `Reroll 1s and 2s · ${e.name}`, () => rerollDamage(e.name, (v) => v <= 2));
      }
      if (!r.attack) continue;
      if ((m = /When you roll a 1 on a damage die, you can roll a d(\d+) and add the result/i.exec(e.t)) && ones && !spent) {
        const sides = Number(m[1]);
        btn(e.key, `${e.name} · +d${sides} for ${ones === 1 ? 'your 1' : `each 1 (${ones})`}`, () => addDamageDice(e.name, ones, sides));
      }
      if (/reroll all damage dice that rolled a result lower than your Proficiency/i.test(e.t) && !spent) {
        const prof = derive(ch).proficiency;
        if (r.result.rolls.some((g) => g.values.some((v) => v < prof))) btn(e.key, `${e.name} · reroll dice under ${prof}`, () => rerollDamage(e.name, (v) => v < prof));
      }
      if (/mark a Stress to use the maximum result of one of your damage dice/i.test(e.t) && !spent) {
        btn(e.key, `${e.name} · max one die (1 Stress)`, () => maxOneDamageDie(e.name, { stress: 1 }));
      }
      const fearDie = lastFearDie(ch.id);
      if (/mark a Stress to add the result of your Fear Die to your damage roll/i.test(e.t) && fearDie && !spent) {
        btn(e.key, `${e.name} · +${fearDie} (Fear Die, 1 Stress)`, () => addToDamage(`${e.name} (Fear Die)`, fearDie, { stress: 1 }));
      }
      if (/Spend 3 Hope to reroll any number of your damage dice on an attack that deals magic damage/i.test(e.t) && r.magic) {
        if (!picking) {
          btn(e.key, `${e.name} · reroll dice for 3 Hope`, () => setPicking(true), { disabled: ch.hope < 3 });
        } else {
          out.push(
            <span key="vm-hint" className="s-muted" style={{ fontSize: 14, textAlign: 'center' }}>Tap the dice to reroll.</span>,
            <span key="vm" style={{ display: 'flex', gap: 8 }}>
              <button className="s-btn s-press" style={{ flex: 1 }} onClick={() => { setPicking(false); setPicked(new Set()); }}>Cancel</button>
              <button className="s-btn solid s-press" style={{ flex: 2 }} disabled={!picked.size || ch.hope < 3}
                onClick={() => { const p = new Set(picked); setPicking(false); setPicked(new Set()); rerollDamage(e.name, (_, g, i) => p.has(key(g, i)), 3); }}>
                Reroll {picked.size || ''} · 3 Hope
              </button>
            </span>,
          );
        }
      }
    }
  }
  return out.length ? <>{out}</> : null;
}

export function RollOverlay() {
  const r = usePlay((s) => s.roll);
  const ch = useStore((s) => (r && 'charId' in r && r.charId ? s.characters[r.charId] : undefined));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState(false);
  useEffect(() => { setPicked(new Set()); setPicking(false); }, [r && 'result' in r ? r.result : r]);
  useEffect(() => {
    if (!r) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRoll(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [r]);
  if (!r) return null;
  const rolling = r.rolling;

  let lines: { label: string; val: string }[] = [];
  let total = 0;
  let outcome: { text: string; light?: boolean } | null = null;

  if (r.kind === 'action') {
    const x = r.result;
    lines = [
      { label: x.hopeSides === 12 ? 'Hope die' : `Hope die (d${x.hopeSides})`, val: String(x.hope) },
      { label: 'Fear die', val: String(x.fear) },
      ...(x.advantageDie !== null ? [{ label: x.advantage === 'advantage' ? 'Advantage d6' : 'Disadvantage d6', val: x.advantage === 'advantage' ? `+${x.advantageDie}` : `−${x.advantageDie}` }] : []),
      ...x.modifiers.map((m) => ({ label: m.label, val: signed(m.value) })),
    ];
    total = x.total;
    outcome = x.outcome === 'critical' ? { text: 'Critical success' } : x.outcome === 'hope' ? { text: 'With Hope' } : { text: 'With Fear', light: true };
  } else if (r.kind === 'damage') {
    const x = r.result;
    lines = [
      ...x.rolls.map((g) => ({ label: `${g.values.length}d${g.sides}${g.dropped !== null ? ` (dropped ${g.dropped})` : ''}`, val: String(g.values.reduce((a, b) => a + b, 0)) })),
      ...(x.critBonus ? [{ label: 'Critical: max dice', val: `+${x.critBonus}` }] : []),
      ...(x.bonus ? [{ label: 'Bonus', val: signed(x.bonus) }] : []),
      ...x.modifiers.map((m) => ({ label: m.label, val: signed(m.value) })),
    ];
    total = x.total;
  } else {
    lines = [
      { label: `${r.values.length}d${r.sides}`, val: String(r.values.reduce((a, b) => a + b, 0)) },
      ...(r.bonus ? [{ label: 'Bonus', val: signed(r.bonus) }] : []),
    ];
    total = r.total;
  }

  return (
    <>
      <button className="s-scrim" aria-label="Close roll" onClick={closeRoll} />
      <div className="s-pop" role="dialog" aria-modal="true" aria-label={r.title} style={{ top: 'max(70px, env(safe-area-inset-top, 0px))' }}>
        <div className="s-row" style={{ alignItems: 'baseline' }}>
          <span className="s-label" style={{ fontSize: 20 }}>{r.title}</span>
          {r.sub && <span className="s-muted" style={{ fontSize: 14 }}>{r.sub}</span>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
          {r.kind === 'action' && (
            <>
              <DieLabel label="Hope"><Die value={r.result.hope} sides={r.result.hopeSides} rolling={rolling} /></DieLabel>
              <DieLabel label="Fear"><Die value={r.result.fear} sides={12} rolling={rolling} fear /></DieLabel>
              {r.result.advantageDie !== null && (
                <DieLabel label={r.result.advantage === 'advantage' ? 'Adv' : 'Dis'}><Die value={r.result.advantageDie} sides={6} rolling={rolling} small /></DieLabel>
              )}
            </>
          )}
          {r.kind === 'damage' && r.result.rolls.flatMap((g, gi) => [
            ...g.values.map((v, i) => (
              <Die key={`${gi}-${i}`} value={v} sides={g.sides} rolling={rolling} small picked={picked.has(key(gi, i))}
                onPick={picking && !rolling ? () => { const p = new Set(picked); if (p.has(key(gi, i))) p.delete(key(gi, i)); else p.add(key(gi, i)); setPicked(p); } : undefined} />
            )),
            ...(g.dropped !== null ? [<Die key={`${gi}-d`} value={g.dropped} sides={g.sides} rolling={rolling} small dropped />] : []),
          ])}
          {r.kind === 'dice' && (r.labels
            ? r.values.map((v, i) => <DieLabel key={i} label={r.labels![i]}><Die value={v} sides={r.sides} rolling={rolling} fear={/fear/i.test(r.labels![i])} /></DieLabel>)
            : r.values.map((v, i) => <Die key={i} value={v} sides={r.sides} rolling={rolling} small />))}
        </div>
        {rolling ? (
          <span className="s-label" style={{ textAlign: 'center', fontSize: 16, letterSpacing: '.2em' }} aria-live="polite">Rolling…</span>
        ) : (
          <>
            {!(r.kind === 'dice' && r.labels) && <div style={{ display: 'flex', flexDirection: 'column' }} aria-live="polite">
              {lines.map((l, i) => (
                <div key={i} className="s-row" style={{ minHeight: 30, borderBottom: '1px solid var(--line)', fontSize: 15 }}>
                  <span>{l.label}</span><span className="s-num" style={{ fontSize: 18 }}>{l.val}</span>
                </div>
              ))}
              <div className="s-row" style={{ paddingTop: 8 }}>
                <span className="s-label" style={{ fontSize: 16 }}>Total</span>
                <span className="s-num" style={{ fontSize: 52, fontWeight: 600 }}>{total}</span>
              </div>
            </div>}
            {outcome && <div className={`s-outcome ${outcome.light ? 'light' : ''}`}>{outcome.text}</div>}
            {r.effects.map((e, i) => <span key={i} style={{ fontSize: 14, textAlign: 'center' }}>{e}</span>)}
            <Followups r={r} ch={ch} picked={picked} setPicked={setPicked} picking={picking} setPicking={setPicking} />
            <button className={`s-btn s-press ${r.kind === 'action' && r.damageFn && r.result.outcome === 'critical' ? '' : 'solid'}`} onClick={closeRoll} autoFocus>Done</button>
          </>
        )}
      </div>
    </>
  );
}

function DieLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      {children}
      <span className="s-label" style={{ fontSize: 12 }}>{label}</span>
    </div>
  );
}
