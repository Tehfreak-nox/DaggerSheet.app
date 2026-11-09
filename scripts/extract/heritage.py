"""Ancestries (SRD pp. 32–38) and communities (pp. 38–42)."""
from __future__ import annotations

import re

from classes import split_features
from pdftext import Line
from textutil import join, plain, slug, title

ELEMENTAL = {'EARTHKIN', 'EMBERKIN', 'SKYKIN', 'TIDEKIN'}


def _chunks(lines: list[Line]) -> list[tuple[str, list[Line]]]:
    out: list[tuple[str, list[Line]]] = []
    for l in lines:
        if l.style == 'H12':
            out.append((l.text, []))
        elif l.style == 'H17':
            out.append(('', []))
        elif out:
            out[-1][1].append(l)
    return out


def ancestries(lines: list[Line]) -> tuple[list[dict], dict]:
    sec = [l for l in lines if 32 <= l.page <= 38]
    stop = next(i for i, l in enumerate(sec) if l.style == 'H17' and l.text == 'COMMUNITIES')
    out, mixed = [], {}
    for head, body in _chunks(sec[:stop]):
        if head in ('', 'ANCESTRY FEATURES', 'ELEMENTAL KIN'):
            continue
        if head == 'MIXED ANCESTRY':
            mixed = {'id': 'mixed', 'name': 'Mixed Ancestry', 'text': join(body).replace('__', '**')}
            continue
        i = next(i for i, l in enumerate(body) if l.style == 'B11' and plain(l.text).startswith('ANCESTRY FEATURE'))
        feats = split_features(body[i + 1:])
        assert len(feats) == 2 and all(f['name'] for f in feats), (head, feats)
        a = {'id': slug(head), 'name': title(head), 'description': plain(join(body[:i])), 'features': feats}
        if head in ELEMENTAL:
            a['group'] = 'Elemental Kin'
        out.append(a)
    return out, mixed


def communities(lines: list[Line]) -> list[dict]:
    sec = [l for l in lines if 38 <= l.page <= 42]
    start = next(i for i, l in enumerate(sec) if l.style == 'H17' and l.text == 'COMMUNITIES')
    stop = next(i for i, l in enumerate(sec) if l.style == 'H17' and l.text == 'TRANSFORMATIONS')
    out = []
    for head, body in _chunks(sec[start:stop]):
        if not head:
            continue
        i = next(i for i, l in enumerate(body) if l.style == 'B11' and plain(l.text) == 'COMMUNITY FEATURE')
        desc = [l for l in body[:i] if l.style != 'I']
        adj_text = plain(join([l for l in body[:i] if l.style == 'I']))
        m = re.match(r'^\w+ are often (.+)\.$', adj_text)
        assert m, (head, adj_text)
        adjectives = [a.strip() for a in re.split(r',\s*(?:and\s+)?', m.group(1))]
        feats = split_features(body[i + 1:])
        assert len(feats) == 1 and feats[0]['name'], (head, feats)
        out.append({'id': slug(head), 'name': title(head), 'description': plain(join(desc)),
                    'adjectives': adjectives, 'feature': feats[0]})
    return out


TRANSFORMATION_NAMES = ['DEMIGOD', 'GHOST', 'REANIMATED', 'SHAPESHIFTER', 'VAMPIRE', 'WEREWOLF']


def transformations(lines: list[Line]) -> dict:
    """Transformations (pp. 42–45): the rules text and the six transformation cards."""
    sec = [l for l in lines if 42 <= l.page <= 45 and not l.text.startswith('**Daggerheart SRD**') and not re.match(r'^\d+ \*\*Daggerheart SRD\*\*$', l.text)]
    start = next(i for i, l in enumerate(sec) if l.style == 'H17' and l.text == 'TRANSFORMATIONS')
    sec = sec[start + 1:]
    stop = next((i for i, l in enumerate(sec) if l.style == 'H28' or l.style == 'H17'), len(sec))
    sec = sec[:stop]
    rules_text, cards = [], []
    for head, body in _chunks([Line(sec[0].page, sec[0].col, 0, 0, 'H12', 'RULES')] + sec):
        if head in ('RULES', 'GRANTING TRANSFORMATIONS'):
            rules_text.append(join(body))
            continue
        assert head in TRANSFORMATION_NAMES, head
        fi = next(i for i, l in enumerate(body) if l.style == 'B11' and l.text == 'TRANSFORMATION FEATURES')
        qi = next(i for i, l in enumerate(body) if l.style == 'B11' and l.text == 'TRANSFORMATION QUESTIONS')
        feats = split_features(body[fi + 1:qi])
        assert len(feats) == 2 and all(f['name'] for f in feats), (head, feats)
        questions = [plain(q) for q in re.split(r'\n?• ', join(body[qi + 1:])) if q.strip()]
        assert len(questions) == 6, (head, questions)
        cards.append({'id': slug(head), 'name': title(head), 'description': plain(join(body[:fi])), 'features': feats, 'questions': questions})
    assert [c['name'] for c in cards] == ['Demigod', 'Ghost', 'Reanimated', 'Shapeshifter', 'Vampire', 'Werewolf'], cards
    return {'rules': '\n\n'.join(plain(t) for t in rules_text), 'cards': cards}
