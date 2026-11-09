# Data flags

Things in the source PDFs that were ambiguous, inconsistent, or not stated in
the SRD text, and the call that was made. Each one is open for review.

## Values taken from the character sheets, not SRD text

| Value | Source | Notes |
|---|---|---|
| Advancement slots per tier (traits 3, HP 2, Stress 2, Experiences 1, domain card 1, Evasion 1; tier 3–4 add subclass 1, Proficiency 2, Multiclass 2) | Checkbox graphics on the Bard guide page | Counted automatically in `rules.py::sheet_slots` and asserted, so a sheet revision will fail the build instead of drifting. Proficiency and Multiclass are "black box" options: one pick costs both slots. |
| 12 Hit Point slots and 12 Stress slots, 6 Proficiency circles | Sheet layout | The SRD only says Armor Score can't exceed 12. |
| Domain-card advancement "up to level 4" (tier 2) and "up to level 7" (tier 3) | Sheet text | The SRD says "at or below your level", which gives the same cap. |

## Inconsistencies in the SRD

- **Mythic Hybrid** prints its attack as `Strength Melee d12+10 phy` (trait before range). Every other Beastform prints range first. The parser accepts both orders.
- **Arcane-Frame Wheelchair** uses `Spellcast` as its trait. It's stored as `trait: "spellcast"` and means "your Spellcast trait".
- **Legendary Beast** and **Mythic Beast** have no fixed stats: you pick a lower-tier form and gain the listed bonuses. They're stored with `trait: null`, `attack: null` and the rules in their `Evolved` feature.
- **Page 23 (Rogue)**: a line of the Syndicate's *Contacts Everywhere* option overlaps the "FOUNDATION FEATURE" label in the PDF's text layer. Fixed by grouping text by baseline and ignoring space glyphs when measuring column gaps; covered by the class tests.

## Suggestions

- **All 13 classes have official character guides.** The extra sheet PDF (`CharacterGuidesAndSheetsTile_HF_2026-07-23.pdf`) covers Assassin, Brawler, Warlock and Witch, so the mockup's "App suggestion" fallback isn't needed. The official spreads differ from the mockup's `REC` table for 10 entries (assassin a/b, brawler, druid, guardian, seraph, warlock, warrior, witch a, wizard). `guides.json` uses the official ones.
- **Witch** has one guide for both subclasses, and it leads with Instinct (+2 Instinct, +1 Knowledge). That fits Moon (Instinct), but Hedge casts with Knowledge. **Decision needed:** use the official spread for both subclasses, or offer a Hedge variant labelled "App suggestion"?
- The guide's **Brawler** primary weapon is *Brawler's Strike* from the "I Am the Weapon" class feature. It's not a table weapon, so it's stored with `id: null` and its stats inline.

## Rules engine decisions (src/rules)

Each of these is a reading of the SRD that the engine currently implements. Each is covered by a test, so changing one is a one-line edit plus a test update.

- **Multiclass "gain its class feature"**: Warrior, Brawler, Assassin, Druid, Rogue, Sorcerer, Warlock, Witch and Wizard each have *two or more* class features, so "its class feature" is ambiguous. The engine shows the multiclass class's features as text but doesn't apply their stat effects (e.g. a Bard multiclassing into Warrior doesn't ignore burden). **Decision needed.**
- **Upgraded subclass card after multiclassing** upgrades your main subclass; the multiclass subclass stays at its foundation.
- **Advancement slots**: a pick marks the highest tier's slot that has room (your tier first, then lower tiers). Upgrading your subclass crosses out that tier's multiclass option. Multiclassing crosses out every other multiclass option and that tier's subclass upgrade.
- **Stress overflow**: "must mark Stress but can't → mark 1 HP instead". When only part of the Stress fits, the engine marks what fits plus 1 HP.
- **"Half your Agility" (Untouchable)** rounds up (SRD: round up unless stated) and gives no bonus below 0. **Enchanted** (Mage Robes) and **Magnificent** likewise add nothing when the trait is 0 or negative, rather than applying a penalty.
- **Domain card exchange** at level up: the new card must be of the old card's level or lower, and legal for you now.
- **Unarmored**: Armor Score 0, Major = level, Severe = 2 × level, as the SRD states. Threshold bonuses from features still apply; "while wearing armor" cards (Fortified Armor, Armorer) don't.
- **Armor weight icons** (creation): the SRD gives no light/medium/heavy category. The app reads it from Armor Score minus tier (1 light, 2 medium, 3+ heavy), which matches the robes / gambeson / chainmail pattern in every tier.
- **Domain icons** are the app's own drawings. The official Daggerheart domain symbols aren't part of the SRD licence, so they aren't used.
- **Blaze of Glory** arms an automatic critical success for the next action roll; after that roll the character is marked as having crossed the veil. "With GM approval" is left to the table.
- **Risk It All** clears Hope-die points from Hit Points first, then Stress; the sheet then lets you move points between them as the SRD allows.
- **Evolution with a Hybrid**: Evolution replaces Beastform's own Stress; a Hybrid's "additional Stress" is still marked.
- **Beastform damage dice**: "add a d8 to your damage roll" (Pack Hunting) is a toggle on the beast attack that rolls with it. Rampage's +1 Proficiency marks its Stress when armed (refunded if you disarm it before rolling); its d10 for each 1, and Deadly Raptor's reroll, are offered on the damage result.
- **Paired / Focused** (secondary weapons): the primary-weapon damage bonus is always included while the weapon is equipped. The book limits it to targets within Melee (Paired) or Very Close (Focused) range; leave it off by hand against farther targets.
- **Rest moves on allies** (Tend to Wounds, Repair Armor on an ally) aren't modelled; the engine applies moves to the resting character.

## Card and feature buttons: outliers

Every card and feature text is read by `src/rules/mechanics.ts` with one set of rules (see the comment at its top; `mechanics.test.ts` pins the result for the cards reviewed). These don't fit the rules and are handled partly or left to you:

- **Need the GM's Fear count:** Avatar of Terror (+1d6 damage per Fear; the app only takes its Hope before each action roll), Dread-Touched (bonus = Fear), Umbral Veil (tokens = Fear, counted by hand), Night Terror (d6s = stolen Fear, amount picker).
- **Offered on every result; tap only when it applies:** Glancing Blow (on a missed attack), Endless Charisma and Heart of a Poet (rolls to persuade), Nemesis swap (against your Prioritized target), Fearless / Freeborne / Stealth Expertise (rolls with Fear).
- **Reminder only:** Champion's Edge "target marks an additional Hit Point"; Splintering Strike and Deathrun damage split between targets.
- **Not tracked:** Words of Discord (−5 when recast on the same target), Copycat (Hope = half the copied card's level), Fane of the Wilds (spend tokens after the roll; token count = your Sage cards), Forager (rolls the d6, doesn't look up the table), Grace-Touched and Splendor-Touched (paying with Armor Slots, Stress or Hope instead), Shadowhunter, Sage-Touched (+2 Spellcast in nature), Voice of Reason (+1 Proficiency with all Stress marked), Inevitable.

## Phase 1 SRD pass: calls made and open questions

Class resources, states, transformations and items now run from `src/rules/custom.ts` (per-feature buttons),
`active.ts` (lasting effects with choices), `transformation.ts` and `items.ts`. `phase1.test.ts` covers them and
sweeps every class, subclass and transformation from level 1 to 10 with everything switched on.

**Calls made (say if you want them different):**
- **Known martial stances:** two at the foundation plus one per level after 1 (multiclassing into Martial Artist later gives the same count).
- **Companion** follows the Ranger Companion sheet: 3 Stress (3 more with Resilient), and the boxes for how often each training option can be taken.
- **Honing Relic** adds +1 to your first Experience. Both say "of your choice".
- **Gems, Greatstone, Bloodstone** go on your primary weapon (the stones only if it has no feature). Only the first gem and the first relic count.
- **Combo Die** size is picked on the Combo Strike card, one step per tier (d4 → d6 at tier 2, and so on). The SRD makes it a level-up option; the level-up screen doesn't offer it yet.
- **Contacts Everywhere "+3 to your Hope or Fear Die"** is applied to the Hope Die.
- **Mnemonic Potion** gives the Hope back instead of making the next Experience free (the same thing if used right away).
- **Stardrop, Jar of Lost Voices, shards (Emberite etc.)** roll their damage with no attack roll; the targets' reaction rolls are the GM's.
- **"Until you take Severe damage / mark a Hit Point"** (Channel, Patron's Mantle, Eye of the Storm, Potion of Vigilance, stances): the app doesn't track incoming damage, so End them by hand.

**Still reminders (the GM or the fiction decides):** Witch's Charm, Hex, Weight of Divinity's "or the GM gains a Fear", Ghost and
Reanimated drawbacks, Corpse, Yakamel Milk, Hopehold Flare, Phobophage's Circlet trigger, Two-Faced Aegis Brooch and Eclipse Coin flips,
Airblade Charm's extra attack, Ring of Resistance, Twin Fang and the poisons' effects on the target.

## Not extracted (out of scope for now)

- GM material, adversaries, environments, campaign frames.
- Background and connection questions come from the SRD class pages. The guides print the same questions; they aren't extracted a second time.
