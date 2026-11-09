"""Weapons, armor, items and consumables from the SRD tables (pp. 55–84)."""
from __future__ import annotations

import os
import re

import pypdf

from pdftables import raw_tables, records
from textutil import plain, slug

RANGES = ['Melee', 'Very Close', 'Close', 'Far', 'Very Far']
# 'Spellcast' (Arcane-Frame Wheelchair) means "your Spellcast trait".
TRAITS = {'Agility', 'Strength', 'Finesse', 'Instinct', 'Presence', 'Knowledge', 'Spellcast'}
DAMAGE = re.compile(r'^d(\d+)(?:\+(\d+))? (phy|mag|phy/mag)$')


def equipment_pdf(sources: str, out_dir: str) -> str:
    """Pages 55–84 span two of the four SRD parts; tables continue across
    that boundary, so join them into one PDF before walking it."""
    w = pypdf.PdfWriter()
    r1 = pypdf.PdfReader(os.path.join(sources, 'DH_SRD_2_part1_p1-56.pdf'))
    r2 = pypdf.PdfReader(os.path.join(sources, 'DH_SRD_2_part2_p57-112.pdf'))
    for i in range(54, 56):
        w.add_page(r1.pages[i])
    for i in range(0, 28):
        w.add_page(r2.pages[i])
    path = os.path.join(out_dir, 'srd_p55-84.pdf')
    with open(path, 'wb') as f:
        w.write(f)
    return path


def feature(cell: str) -> dict | None:
    cell = cell.strip()
    if not cell or plain(cell) in ('—', '-'):
        return None
    m = re.match(r'^__(.+?):?__:?\s*(.*)$', cell)
    if m and m.group(1):
        name = plain(m.group(1)).rstrip(':')
        # The feature name can wrap ("__Very__ __Heavy:__") – join adjacent runs.
        return {'name': name, 'text': plain(m.group(2))}
    return {'name': '', 'text': plain(cell)}


def fix_feature_cell(cell: str) -> str:
    return re.sub(r'__\s+__', ' ', cell)


def parse_damage(s: str) -> dict:
    m = DAMAGE.match(s.replace('−', '-').strip())
    assert m, s
    die, bonus, typ = m.groups()
    return {'die': int(die), 'bonus': int(bonus or 0), 'type': typ}


def tier_of(ctx: dict) -> int:
    return int(re.search(r'TIER (\d)', ctx['tier']).group(1))


def split_trait_range(trait: str, rng: str) -> tuple[str, str]:
    # Two-word ranges can spill into the Trait column ("Very" / "Close").
    return trait, rng


def weapons(tables: list[dict]) -> list[dict]:
    out = []
    for t in tables:
        sec = t['ctx'].get('section', '')
        names = [c[0] for c in t['cols']]
        if 'Trait' not in names:
            continue
        wheelchair = 'Tier' in names
        if not wheelchair and 'WEAPON TABLES' not in sec:
            continue
        key = names.index('Trait')
        for rec in records(t, key):
            row = dict(zip(names, rec))
            name = plain(row['Name'])
            trait = plain(row['Trait'])
            assert trait in TRAITS, (name, row)
            rng = plain(row['Range'])
            assert rng in RANGES, (name, row)
            dmg = parse_damage(plain(row['Damage']))
            burden = plain(row['Burden'])
            assert burden in ('One-Handed', 'Two-Handed'), (name, row)
            category = 'secondary' if sec.startswith('SECONDARY') else 'primary'
            tier = int(plain(row['Tier'])) if wheelchair else tier_of(t['ctx'])
            out.append({
                'id': slug(name),
                'name': name,
                'tier': tier,
                'category': category,
                'trait': trait.lower(),
                'range': slug(rng),
                'damage': dmg,
                'burden': 1 if burden == 'One-Handed' else 2,
                'feature': feature(fix_feature_cell(row['Feature'])),
                **({'group': 'combat-wheelchair'} if wheelchair else {}),
            })
    return out


def armor(tables: list[dict]) -> list[dict]:
    out = []
    for t in tables:
        if t['ctx'].get('section') != 'ARMOR TABLES':
            continue
        names = [c[0] for c in t['cols']]
        key = names.index('Thresholds')
        for rec in records(t, key):
            row = dict(zip(names, rec))
            name = plain(row['Name'])
            m = re.match(r'^(\d+) / (\d+)$', plain(row['Thresholds']))
            assert m, row
            out.append({
                'id': slug(name),
                'name': name,
                'tier': tier_of(t['ctx']),
                'thresholds': {'major': int(m.group(1)), 'severe': int(m.group(2))},
                'score': int(plain(row['Score'])),
                'feature': feature(fix_feature_cell(row['Feature'])),
            })
    return out


def loot(tables: list[dict]) -> list[dict]:
    out = []
    for t in tables:
        sec = t['ctx'].get('section')
        if sec not in ('ITEMS', 'CONSUMABLES'):
            continue
        sub = t['ctx'].get('sub', '')
        names = [c[0] for c in t['cols']]
        groups = [slice(0, 3)] if len(names) < 6 else [slice(0, 3), slice(3, 6)]
        for g in groups:
            for rec in records({'rows': t['rows']}, 0, g):
                roll, name, desc = rec
                if not roll:
                    continue
                name = plain(name)
                out.append({
                    'id': slug(name),
                    'name': name,
                    'kind': 'consumable' if sec == 'CONSUMABLES' else 'item',
                    'roll': int(roll),
                    'set': 'core' if sub.startswith('Core') else 'additional',
                    'text': plain(desc).replace(' __', ' ').replace('__', ''),
                })
    out.sort(key=lambda x: (x['kind'], x['set'] != 'core', x['roll']))
    return out


def parse(sources: str, out_dir: str) -> tuple[list, list, list]:
    path = equipment_pdf(sources, out_dir)
    tables = list(raw_tables(path, 55))
    return weapons(tables), armor(tables), loot(tables)


# Text from the Gold sidebar that the table reader can pick up when the sidebar
# shares the page with the loot table (SRD p. 84, consumables 52-55).
SIDEBAR = re.compile(r'Gold is an abstract|Optional Rule: Gold Coins|handfuls, bags, and chests|more than 1 chest|9 handfuls')


def fix_loot_from_lines(loot_items: list[dict], lines) -> None:
    """Rebuild a description from the SRD text lines when the table cell picked up sidebar text."""
    for item in loot_items:
        if not SIDEBAR.search(item['text']):
            continue
        start = next(i for i, ln in enumerate(lines) if re.match(rf"{item['roll']} \*\*", ln.text)
                     and plain(ln.text.split('**')[1]).split()[0] == item['name'].split()[0])
        first = lines[start]
        words = [first.text.split('**', 2)[2].strip()]
        for ln in lines[start + 1:]:
            if ln.page != first.page or ln.col != first.col or re.match(r'\d+ \*\*', ln.text):
                break
            words.append(re.sub(r'^\*\*[^*]+\*\*\s*', '', ln.text).strip())
        item['text'] = plain(' '.join(w for w in words if w))
        assert not SIDEBAR.search(item['text']), item
