// Every feature and card text in effect for a character, keyed the way the
// sheet keys its use boxes and tokens ("card:<id>", "anc:<feature>", …).
import { cardById, classById, communityById, type DomainId } from '../data';
import { transformationFeatures } from './transformation';
import { workingAncestryFeatures, classOf, multiclassSubclass, subclassOf, STAGES } from './derive';
import { activeForm } from './forms';
import type { Character } from './model';

export interface InEffect { key: string; name: string; text: string }

/** "<Domain>-Touched" cards work only with 4+ cards of that domain in the loadout. */
export function touchedActive(ch: Character, domain: DomainId): boolean {
  return ch.cards.loadout.filter((id) => cardById.get(id)?.domain === domain).length >= 4;
}

export function inEffect(ch: Character): InEffect[] {
  const cls = classOf(ch);
  const out: InEffect[] = [{ key: `hope:${cls.id}`, name: cls.hopeFeature.name, text: cls.hopeFeature.text }];
  for (const f of cls.features) out.push({ key: `class:${f.id}`, name: f.name, text: f.text });
  const sub = subclassOf(ch);
  const upTo = STAGES.indexOf(ch.subclassStage);
  for (const st of STAGES.slice(0, upTo + 1)) for (const f of sub[st]) out.push({ key: `sub:${f.id}`, name: f.name, text: f.text });
  const mc = ch.multiclass ? classById.get(ch.multiclass.classId) : undefined;
  if (mc) for (const f of mc.features) out.push({ key: `mc:${f.id}`, name: f.name, text: f.text });
  const mcs = multiclassSubclass(ch);
  if (mcs) for (const f of mcs.foundation) out.push({ key: `mcsub:${f.id}`, name: f.name, text: f.text });
  for (const f of workingAncestryFeatures(ch)) out.push({ key: `anc:${f.id}`, name: f.name, text: f.text });
  for (const f of transformationFeatures(ch)) out.push({ key: `tf:${f.id}`, name: f.name, text: f.text });
  const com = communityById.get(ch.communityId);
  if (com) out.push({ key: `com:${com.feature.id}`, name: com.feature.name, text: com.feature.text });
  for (const id of ch.cards.loadout) {
    const c = cardById.get(id);
    if (!c) continue;
    if (/-touched$/.test(c.id) && !touchedActive(ch, c.domain)) continue;
    out.push({ key: `card:${c.id}`, name: c.name, text: c.text });
  }
  const form = activeForm(ch);
  if (form) for (const x of form.features) out.push({ key: `beast:${x.key}`, name: x.feature.name, text: x.feature.text });
  return out;
}
