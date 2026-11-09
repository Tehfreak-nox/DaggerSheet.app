"""Helpers that turn extracted lines into clean Markdown-lite text."""
from __future__ import annotations

import re
import unicodedata

from pdftext import Line

BULLET = re.compile(r'^(?:\*\*)?([•◦→])(?:\*\*)?\s*')


def slug(s: str) -> str:
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    s = s.replace("'", '').replace('’', '')
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def plain(s: str) -> str:
    """Strip markup."""
    return re.sub(r'(\*\*|__|(?<![A-Za-z0-9])_|_(?![A-Za-z0-9]))', '', s).strip()


def tidy(s: str) -> str:
    """Normalise markup after lines have been joined."""
    s = s.replace('\uf0e0', '→')                 # Symbol-font arrow (Sneak Attack tier table)
    s = re.sub(r'\*\*\s*\*\*', ' ', s)           # **a** **b** -> **a b**
    s = re.sub(r'__\s*__', ' ', s)
    s = re.sub(r'(?<=\w)_\s+_(?=\w)', ' ', s)             # _a_ _b_ -> _a b_
    s = re.sub(r'__\s*_\s*:\s*_?', ':__ ', s)      # "__slots___:_" artefacts
    s = re.sub(r'(?<=\S)\*\*\s+(?=[.,;:)])', '**', s)
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r' +([.,;:!?)])', r'\1', s)
    s = re.sub(r'\( +', '(', s)
    return s.strip()


def bold_to_md(s: str) -> str:
    """Bold-italic runs inside body text read as emphasis: render as bold."""
    return re.sub(r'__(.+?)__', r'**\1**', s)


def leading(lines: list[Line]) -> float:
    """Most common line spacing within a run of lines (same page and column)."""
    gaps: dict[int, int] = {}
    for a, b in zip(lines, lines[1:]):
        if a.page == b.page and a.col == b.col and 0 < b.top - a.top < 30:
            g = round(b.top - a.top)
            gaps[g] = gaps.get(g, 0) + 1
    return max(gaps, key=gaps.get) if gaps else 11


def join(lines: list[Line], para_gap: float | None = None) -> str:
    """Join lines into paragraphs. A paragraph breaks on a vertical gap clearly
    larger than the run's leading, before every bullet, and on the first line
    after a bullet that returns to the body margin."""
    if para_gap is None:
        para_gap = leading(lines) + 1.6
    out: list[str] = []
    prev: Line | None = None
    bullet_x: float | None = None
    for l in lines:
        t = l.text.strip()
        if not t:
            continue
        bullet = BULLET.match(t)
        if bullet:
            t = bullet.group(1) + ' ' + t[bullet.end():]
        outdent = bullet_x is not None and not bullet and l.x0 < bullet_x - 1.5
        # Leading in these PDFs is uneven, so a wide gap only breaks a paragraph
        # when the previous line ends a sentence.
        ended = prev is not None and re.search(r'[.:!?”)](\*\*|_)?$', prev.text.strip()) is not None
        brk = prev is None or bool(bullet) or outdent or (
            ended and prev.page == l.page and prev.col == l.col and l.top - prev.top > para_gap)
        if bullet:
            bullet_x = l.x0
        elif brk:
            bullet_x = None
        if prev is None:
            out.append(t)
        elif brk:
            out.append(('\n' if bullet else '\n\n') + t)
        else:
            last = out[-1]
            if re.search(r'[-—–]$', last) and not last.endswith(' -'):
                out[-1] = last + t
            else:
                out[-1] = last + ' ' + t
        prev = l
    text = ''.join(out)
    text = '\n'.join(tidy(p) for p in text.split('\n'))
    text = re.sub(r'\n\n+(?=[•◦→] )', '\n', text)
    return text.strip()


SMALL = {'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with'}


def title(s: str) -> str:
    """'CHAMPION’S EDGE' -> 'Champion’s Edge', 'BOOK OF AVA' -> 'Book of Ava'."""
    words = plain(s).split()
    out = []
    for i, w in enumerate(words):
        lw = w.lower()
        if 0 < i < len(words) - 1 and lw in SMALL:
            out.append(lw)
        else:
            out.append('-'.join(p[:1].upper() + p[1:] for p in lw.split('-')))
    return ' '.join(out)
