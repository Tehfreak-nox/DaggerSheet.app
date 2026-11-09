import ancestriesJson from './ancestries.json';
import armorJson from './armor.json';
import classesJson from './classes.json';
import communitiesJson from './communities.json';
import transformationsJson from './transformations.json';
import domainCardsJson from './domainCards.json';
import guidesJson from './guides.json';
import lootJson from './loot.json';
import mixedAncestryJson from './mixedAncestry.json';
import rulesJson from './rules.json';
import weaponsJson from './weapons.json';
import type {
  Ancestry, Armor, ClassDef, Community, Transformation, DomainCard, DomainId, Guide, Loot,
  MixedAncestryRule, Rules, Weapon,
} from './types';

export * from './types';

// JSON imports are widened to string/number; the generator and data.test.ts
// guarantee they match these types.
export const classes = classesJson as unknown as ClassDef[];
export const ancestries = ancestriesJson as unknown as Ancestry[];
export const mixedAncestry = mixedAncestryJson as unknown as MixedAncestryRule;
export const communities = communitiesJson as unknown as Community[];
/** Transformation cards and the rules for them (SRD pp. 42–45). */
export const transformations = transformationsJson.cards as unknown as Transformation[];
export const transformationRules = transformationsJson.rules;
export const domainCards = domainCardsJson as unknown as DomainCard[];
export const weapons = weaponsJson as unknown as Weapon[];
export const armor = armorJson as unknown as Armor[];
export const loot = lootJson as unknown as Loot[];
export const guides = guidesJson as unknown as Record<string, Guide>;
export const rules = rulesJson as unknown as Rules;

export const DOMAINS: DomainId[] = [
  'arcana', 'blade', 'bone', 'codex', 'dread', 'grace', 'midnight', 'sage', 'splendor', 'valor',
];

const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));

export const classById = byId(classes);
export const ancestryById = byId(ancestries);
export const communityById = byId(communities);
export const transformationById = byId(transformations);
export const cardById = byId(domainCards);
export const weaponById = byId(weapons);
export const armorById = byId(armor);
export const lootById = byId(loot);
