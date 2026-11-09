import type { AdvancementId, Armor, DomainId, Loot, TraitId, Weapon } from '../data';
import type { BeastformChoice } from './forms';

export const TRAIT_IDS: TraitId[] = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];

export type SubclassStage = 'foundation' | 'specialization' | 'mastery';

/** Ancestry is either a single ancestry or a mixed one: features[0] of `first`, features[1] of `second`. */
export type AncestryChoice = { id: string } | { mixed: { first: string; second: string } };

/** An Experience. Its modifier is derived: +2 plus every permanent bonus
 * (advancements, Clank "Purposeful Design", Master of the Craft). */
export interface Experience {
  name: string;
}

/** Equipped or carried weapon: a table weapon by id, or a homebrew copy. */
export interface WeaponSlot {
  id: string;
  /** Use the Versatile alternate statistics. */
  versatile?: boolean;
}

export interface Gold {
  coins: number;
  handfuls: number;
  bags: number;
  chests: number;
}

/** An inventory entry: a loot table item/consumable by id, or a custom item with a name. */
export interface InventoryItem {
  id: string;
  name?: string;
  qty: number;
}

export type AdvancementChoice =
  | { id: 'traits'; traits: [TraitId, TraitId] }
  | { id: 'hitPoint' }
  | { id: 'stress' }
  | { id: 'experiences'; experiences: [number, number] }
  | { id: 'domainCard'; card: string }
  | { id: 'evasion' }
  | { id: 'subclass' }
  | { id: 'proficiency' }
  | { id: 'multiclass'; classId: string; domain: DomainId; subclassId: string };

/** One marked slot on the level-up sheet. */
export interface AdvancementMark {
  level: number;
  /** Sheet tier whose slot was marked (your tier or lower). */
  tier: 2 | 3 | 4;
  choice: AdvancementChoice;
}

export interface Multiclass {
  classId: string;
  domain: DomainId;
  subclassId: string;
  level: number;
}

/** Choices made for cards/features that grant a pick (Vitality, Master of the Craft, Clank). */
export interface PermanentPicks {
  /** Vitality: two different benefits. */
  vitality?: ('stress' | 'hitPoint' | 'thresholds')[];
  /** Master of the Craft: +2 to two Experiences or +3 to one (Experience indexes). */
  masterOfTheCraft?: { experiences: number[] };
  /** Wizard "Strange Patterns": the chosen number (1–12). */
  strangePatterns?: number;
  /** Brawler Combo Die size (d4, raised by level advancements). */
  comboDie?: number;
  /** Martial Artist: stances known (ids). */
  stances?: string[];
  /** Shapeshifter "Change Shape": the ancestry feature taken (feature id). */
  shapeshifter?: string;
}

/** A Beastbound Ranger's animal companion (SRD "Ranger Companion"). */
export interface Companion {
  name: string;
  /** Companion Experiences (+2 each; one more each time you gain an Experience). */
  experiences: string[];
  /** Level-up options marked on the companion sheet (ids). */
  options: string[];
  damageType: 'physical' | 'magic';
  stress: number;
}

export interface Character {
  version: 1;
  id: string;
  name: string;
  pronouns: string;
  classId: string;
  subclassId: string;
  ancestry: AncestryChoice;
  communityId: string;
  level: number;
  /** Base modifiers assigned at creation (+2, +1, +1, 0, 0, −1). */
  traits: Record<TraitId, number>;
  experiences: Experience[];
  /** Index of the Experience boosted by Clank "Purposeful Design". */
  purposefulDesign?: number;
  subclassStage: SubclassStage;
  multiclass?: Multiclass;
  advancements: AdvancementMark[];
  /** Traits marked by the "+1 to two traits" advancement in the current tier. */
  markedTraits: TraitId[];
  primary?: WeaponSlot;
  secondary?: WeaponSlot;
  inventoryWeapons: WeaponSlot[];
  armorId?: string;
  cards: { loadout: string[]; vault: string[] };
  picks: PermanentPicks;
  /** Current track values. */
  hp: number;
  stress: number;
  hope: number;
  armorMarked: number;
  gold: Gold;
  safe: Gold;
  items: InventoryItem[];
  shortRestStreak: number;
  /** Per-feature use counters keyed by feature key; cleared by rests. */
  uses: Record<string, number>;
  background: Record<string, string>;
  description: Record<string, string>;
  /** Avoid Death scars: each one permanently crosses out a Hope slot. */
  scars?: number;
  /** Druid Beastform in effect (see forms.ts for evolved and hybrid choices). */
  beastform?: BeastformChoice;
  /** After marking the last Hit Point: the death move in play. */
  death?: 'unconscious' | 'blaze' | 'dead';
  /** Lasting effects switched on (feature keys, see active.ts). */
  active?: string[];
  /** Options chosen for lasting effects (a stance's trait, a Channeled element), keyed like `active`. */
  activeOpts?: Record<string, string[]>;
  /** Dice kept with their values: Prayer Dice ("prayer"). */
  heldDice?: Record<string, number[]>;
  /** Ranger (Beastbound) companion sheet. */
  companion?: Companion;
  /** Reanimated "Won't Stay Dead": Hit Points marked for good (they can't be cleared). */
  permanentHp?: number;
  /** A chosen Transformation (SRD pp. 42–45), by id. */
  transformation?: string;
  /** Track coins in the gold section (optional rule). */
  coins?: boolean;
  /** Custom gear created for this character (ids start with "hb-"). */
  homebrew?: { weapons: Weapon[]; armor: Armor[]; items: Loot[] };
  /** Last change (ms since epoch); newest copy wins when syncing devices. */
  updatedAt?: number;
}

export type { AdvancementId };
