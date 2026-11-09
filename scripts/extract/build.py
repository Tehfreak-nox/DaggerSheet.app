"""Build typed rules data under src/data/ from the PDFs in sources/.

    python3 -I scripts/extract/build.py

Writes src/data/*.json and a debug dump of the extracted text to
scripts/extract/out/. Hand corrections live in scripts/extract/overrides/
and are applied last; every override records why it exists.
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import cards  # noqa: E402
import classes  # noqa: E402
import equipment  # noqa: E402
import guides  # noqa: E402
import heritage  # noqa: E402
import rules  # noqa: E402
from pdftext import pdf_lines, strip_footers  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(ROOT, 'sources')
OUT = os.path.join(ROOT, 'src', 'data')
DEBUG = os.path.join(HERE, 'out')

SHEETS_CORE = 'Character-Sheets-and-Guides-Daggerheart-Aug252026.pdf'
SHEETS_EXTRA = 'CharacterGuidesAndSheetsTile_HF_2026-07-23.pdf'

SRD_PARTS = [
    ('DH_SRD_2_part1_p1-56.pdf', 1),
    ('DH_SRD_2_part2_p57-112.pdf', 57),
    ('DH_SRD_2_part3_p113-168.pdf', 113),
    ('DH_SRD_2_part4_p169-224.pdf', 169),
]


def srd_lines():
    lines = []
    for name, first in SRD_PARTS:
        lines += pdf_lines(os.path.join(SRC, name), first)
    return lines


def write(name: str, data) -> None:
    path = os.path.join(OUT, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'wrote {os.path.relpath(path, ROOT)} ({len(data)} entries)')


def main() -> None:
    os.makedirs(DEBUG, exist_ok=True)
    lines = srd_lines()
    with open(os.path.join(DEBUG, 'srd.lines.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(str(l) for l in lines))
    lines = strip_footers(lines)
    write('domainCards.json', cards.parse(lines))
    write('classes.json', classes.parse(lines))
    anc, mixed = heritage.ancestries(lines)
    write('ancestries.json', anc)
    write('mixedAncestry.json', mixed)
    write('communities.json', heritage.communities(lines))
    write('transformations.json', heritage.transformations(lines))
    weapons, armor, loot = equipment.parse(SRC, DEBUG)
    equipment.fix_loot_from_lines(loot, lines)
    write('weapons.json', weapons)
    write('armor.json', armor)
    write('loot.json', loot)
    write('rules.json', rules.parse(lines, os.path.join(SRC, SHEETS_CORE)))
    flags: list[str] = []
    write('guides.json', guides.parse(os.path.join(SRC, SHEETS_CORE), os.path.join(SRC, SHEETS_EXTRA), weapons, armor, flags))
    for f in flags:
        print('FLAG', f)


if __name__ == '__main__':
    main()
