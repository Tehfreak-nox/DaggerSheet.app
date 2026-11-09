"""Classes, subclasses and class extras from SRD pp. 9–31."""
from __future__ import annotations

import re

from pdftext import Line
from textutil import bold_to_md, join, plain, slug, title

CLASSES = ['ASSASSIN', 'BARD', 'BRAWLER', 'DRUID', 'GUARDIAN', 'RANGER', 'ROGUE',
           'SERAPH', 'SORCERER', 'WARLOCK', 'WARRIOR', 'WITCH', 'WIZARD']
TRAITS = ['Agility', 'Strength', 'Finesse', 'Instinct', 'Presence', 'Knowledge']
EXTRAS = {'MARTIAL STANCES', 'BEASTFORM OPTIONS', 'RANGER COMPANION'}
NOTE_NAMES = {'Tip', 'Note'}
FEATURE_START = re.compile(r'^(?:• )?__([^_]+?)\s*[:.]?\s*__\s*[:.]?\s*')


def is_heading(l: Line) -> bool:
    return l.style.startswith('H')


def merge_headings(lines: list[Line]) -> list[Line]:
    out: list[Line] = []
    for l in lines:
        p = out[-1] if out else None
        if (p and is_heading(l) and is_heading(p) and p.page == l.page and p.col == l.col
                and 0 < l.top - p.top < 20 and not re.match(r'TIER \d', l.text)):
            out[-1] = Line(p.page, p.col, p.x0, p.top, p.style, p.text + ' ' + l.text)
        else:
            out.append(l)
    return out


def split_features(lines: list[Line], strip_emphasis: bool = False) -> list[dict]:
    """Split a run of lines into features at each "__Name:__" line start."""
    feats: list[tuple[str, list[Line]]] = []
    for l in lines:
        m = FEATURE_START.match(l.text)
        if m:
            # A bold colon after the name: "__Wildtouch__**:** You…", "__Ranger’s Focus__**: Spend a Hope**…"
            rest = re.sub(r'^\*\*\s*:\s*(\*\*\s*)?', lambda x: '' if x.group(1) else '**', l.text[m.end():])
            feats.append((plain(m.group(1)).rstrip(':.'), [Line(l.page, l.col, l.x0, l.top, l.style, rest)]))
        elif feats:
            feats[-1][1].append(l)
        else:
            feats.append(('', [l]))
    out: list[dict] = []
    for name, body in feats:
        text = join(body)
        text = re.sub(r'__(.+?)__', r'\1', text) if strip_emphasis else bold_to_md(text)
        if name in NOTE_NAMES and out:
            # Sidebar tips/notes ("Tip: If your Unstoppable Die…") annotate the previous feature.
            out[-1]['note'] = plain(text)
            continue
        out.append({'id': slug(name), 'name': name, 'text': text})
    return out


def bullets(lines: list[Line]) -> list[str]:
    text = join([l for l in lines if l.style != 'I'])
    return [plain(b).strip() for b in re.split(r'\n?• ', text) if plain(b).strip()]


def label(l: Line) -> str | None:
    """Normalised section label for a line, or None for body text."""
    t = plain(l.text)
    if l.style == 'B11' or (l.style == 'R' and t.startswith(('DOMAINS –', 'CLASS ITEMS –'))):
        for key in ('DOMAINS', 'STARTING EVASION', 'STARTING HIT POINTS', 'CLASS ITEMS'):
            if t.startswith(key):
                return key
        if t.endswith('HOPE FEATURE'):
            return 'HOPE'
        if re.match(r'^CLASS FEATURES?$', t):
            return 'CLASS FEATURES'
        if t.replace(' ', '') == 'SPELLCASTTRAIT':
            return 'SPELLCAST'
        m = re.match(r'^(FOUNDATION|SPECIALIZATION|MASTERY) FEATURES?$', t)
        if m:
            return m.group(1)
        if t in ('BACKGROUND QUESTIONS', 'CONNECTIONS'):
            return t
    return None


def parse(lines: list[Line]) -> list[dict]:
    lines = merge_headings([l for l in lines if 9 <= l.page <= 31])
    # chunk by class heading
    chunks: list[tuple[str, list[Line]]] = []
    for l in lines:
        if is_heading(l) and l.text in CLASSES:
            chunks.append((l.text, []))
        elif chunks:
            chunks[-1][1].append(l)
    return [parse_class(name, body) for name, body in chunks]


def parse_class(name: str, body: list[Line]) -> dict:
    cls: dict = {'id': name.lower(), 'name': name.title(), 'description': '', 'domains': [],
                 'startingEvasion': 0, 'startingHitPoints': 0, 'classItems': '',
                 'hopeFeature': None, 'features': [], 'subclasses': [],
                 'backgroundQuestions': [], 'connectionQuestions': [], 'extras': {}}
    section, buf = 'DESC', []
    sub: dict | None = None
    extra: tuple[str, list[Line]] | None = None

    def flush():
        nonlocal buf
        s, b = section, buf
        buf = []
        if not b and s not in ('DESC',):
            return
        if s == 'DESC':
            cls['description'] = plain(join(b)) if b else ''
        elif s == 'SUBDESC':
            sub['description'] = plain(join(b))
        elif s == 'CLASS ITEMS':
            cls['classItems'] = plain(join(b))
        elif s == 'HOPE':
            f = split_features(b, strip_emphasis=True)[0]
            m = re.search(r'Spend (\d+) Hope', plain(f['text']))
            f['hopeCost'] = int(m.group(1)) if m else 3
            cls['hopeFeature'] = f
        elif s == 'CLASS FEATURES':
            cls['features'] += split_features(b)
        elif s == 'SPELLCAST':
            t = plain(join(b))
            assert t in TRAITS, (name, t)
            sub['spellcastTrait'] = t.lower()
        elif s in ('FOUNDATION', 'SPECIALIZATION', 'MASTERY'):
            sub[s.lower()] += split_features(b)
        elif s == 'SPHERES':
            words = [w for l in b if l.style == 'I' for w in plain(l.text).split()]
            cls['extras']['patronSpheres'] = sorted(words)
        elif s == 'BACKGROUND QUESTIONS':
            cls['backgroundQuestions'] = bullets(b)
        elif s == 'CONNECTIONS':
            cls['connectionQuestions'] = bullets(b)

    for l in body:
        if extra is not None:
            if is_heading(l) and l.text in EXTRAS:
                cls['extras'].update(parse_extra(*extra))
                extra = (l.text, [])
            else:
                lab = label(l)
                if lab in ('BACKGROUND QUESTIONS', 'CONNECTIONS'):
                    raise AssertionError(f'{name}: questions after extras')
                extra[1].append(l)
            continue
        if is_heading(l):
            t = l.text
            if t in EXTRAS:
                flush()
                section = None
                extra = (t, [])
                continue
            if t.endswith('SUBCLASSES'):
                flush()
                section = None
                continue
            if re.match(r'TIER \d', t):
                buf.append(l)
                continue
            flush()
            sub = {'id': slug(t), 'name': title(t), 'description': '', 'spellcastTrait': None,
                   'foundation': [], 'specialization': [], 'mastery': []}
            cls['subclasses'].append(sub)
            section = 'SUBDESC'
            continue
        lab = label(l)
        if lab:
            flush()
            t = plain(l.text)
            if lab == 'DOMAINS':
                doms = t.split('–', 1)[1].strip()
                cls['domains'] = [d.strip().lower() for d in doms.split('&')]
                section = None
            elif lab in ('STARTING EVASION', 'STARTING HIT POINTS'):
                n = int(re.search(r'(\d+)$', t).group(1))
                cls['startingEvasion' if lab == 'STARTING EVASION' else 'startingHitPoints'] = n
                section = None
            elif lab == 'CLASS ITEMS':
                section = 'CLASS ITEMS'
                buf = [Line(l.page, l.col, l.x0, l.top, 'R', t.split('–', 1)[1].strip())]
            else:
                section = lab
            continue
        if l.style == 'B' and plain(l.text) == 'SPHERE OF INFLUENCE EXAMPLES':
            flush()
            section = 'SPHERES'
            continue
        if l.style == 'I' and section in ('BACKGROUND QUESTIONS', 'CONNECTIONS'):
            continue
        if section == 'SUBDESC' and l.style in ('I', 'BI') and 'Choose either' in plain(l.text):
            continue
        if section is not None:
            buf.append(l)
    flush()
    if extra is not None:
        cls['extras'].update(parse_extra(*extra))
    return cls


def parse_extra(head: str, lines: list[Line]) -> dict:
    if head == 'MARTIAL STANCES':
        return {'martialStances': parse_stances(lines)}
    if head == 'BEASTFORM OPTIONS':
        return {'beastforms': parse_beastforms(lines)}
    if head == 'RANGER COMPANION':
        return {'companion': parse_companion(lines)}
    raise ValueError(head)


def sections_by_label(lines: list[Line], is_label) -> list[tuple[str, list[Line]]]:
    out: list[tuple[str, list[Line]]] = [('', [])]
    for l in lines:
        if is_label(l):
            out.append((plain(l.text), []))
        else:
            out[-1][1].append(l)
    return out


def parse_stances(lines: list[Line]) -> dict:
    rules, stances = [], []
    tier = None
    secs = sections_by_label(lines, lambda l: l.style == 'B11')
    for head, body in secs:
        if head == 'STANCE FEATURES':
            run: list[Line] = []
            for l in body:
                m = re.match(r'^TIER (\d)$', plain(l.text))
                if m:
                    if run and tier:
                        stances += [dict(f, tier=tier) for f in split_features(run)]
                    tier, run = int(m.group(1)), []
                elif tier:
                    run.append(l)
            if run and tier:
                stances += [dict(f, tier=tier) for f in split_features(run)]
        elif head or body:
            rules.append({'title': title(head) if head else '', 'text': plain(join(body))})
    return {'rules': rules, 'stances': stances}


def parse_beastforms(lines: list[Line]) -> dict:
    intro: list[Line] = []
    forms: list[dict] = []
    tier = None
    cur: list[Line] | None = None
    name = ''

    def close():
        if cur is not None:
            forms.append(parse_beastform(name, tier, cur))

    for l in lines:
        m = re.match(r'^T?IER (\d)$', l.text) if is_heading(l) else None
        if m:
            close()
            cur = None
            tier = int(m.group(1))
            continue
        if l.style == 'B11' and tier:
            close()
            name, cur = title(l.text), []
            continue
        if cur is not None:
            cur.append(l)
        else:
            intro.append(l)
    close()
    return {'rules': plain(join(intro)), 'forms': forms}


STAT = re.compile(r'^(\w+) ([+−-]\d+) \| Evasion ([+−-]\d+)$')
ATTACK = re.compile(r'^(Melee|Very Close|Close|Far|Very Far) (\w+) (d\d+(?:[+−-]\d+)?) (phy|mag)$')
# Mythic Hybrid prints trait before range ("Strength Melee d12+10 phy").
ATTACK_ALT = re.compile(r'^(\w+) (Melee|Very Close|Close|Far|Very Far) (d\d+(?:[+−-]\d+)?) (phy|mag)$')


def num(s: str) -> int:
    return int(s.replace('−', '-'))


def parse_beastform(name: str, tier: int, lines: list[Line]) -> dict:
    form: dict = {'id': slug(name), 'name': name, 'tier': tier, 'examples': '', 'trait': None,
                  'traitBonus': 0, 'evasionBonus': 0, 'attack': None, 'advantages': [],
                  'features': [], 'text': ''}
    rest: list[Line] = []
    for l in lines:
        t = plain(l.text)
        if t.startswith('(') and not form['examples']:
            form['examples'] = t.strip('()')
        elif STAT.match(t):
            tr, tb, ev = STAT.match(t).groups()
            form['trait'], form['traitBonus'], form['evasionBonus'] = tr.lower(), num(tb), num(ev)
        elif ATTACK.match(t) or ATTACK_ALT.match(t):
            if ATTACK.match(t):
                rng, tr, dmg, typ = ATTACK.match(t).groups()
            else:
                tr, rng, dmg, typ = ATTACK_ALT.match(t).groups()
            form['attack'] = {'range': slug(rng), 'trait': tr.lower(), 'damage': dmg.replace('−', '-'), 'type': typ}
        elif t.startswith('Gain advantage on:'):
            form['advantages'] = [a.strip() for a in t.split(':', 1)[1].split(',')]
        else:
            rest.append(l)
    feats = split_features(rest)
    if feats and not feats[0]['name']:
        form['text'] = feats.pop(0)['text']
    form['features'] = feats
    return form


def parse_companion(lines: list[Line]) -> dict:
    steps, sections, levelUp = [], [], []
    examples: list[str] = []
    secs = sections_by_label(lines, lambda l: (l.style == 'R' and re.match(r'^[A-Z0-9 ,:&’\']{6,}$', plain(l.text)) is not None)
                             or l.style == 'B11' or is_heading(l))
    # Steps / sub-headings wrap onto two lines ("STEP 4: … AND RECORD" / "DAMAGE DIE").
    merged: list[tuple[str, list[Line]]] = []
    for head, body in secs:
        if merged and not merged[-1][1] and head and not is_heading_text(head):
            merged[-1] = (merged[-1][0] + ' ' + head, body)
        else:
            merged.append((head, body))
    for head, body in merged:
        if head == 'Example Companion Experiences':
            examples = [e.strip() for e in plain(join(body)).split(',')]
        elif head.startswith('LEVELING UP YOUR COMPANION'):
            # The intro is everything before the first bullet; wrapped bullet lines belong to their option.
            first = next((i for i, l in enumerate(body) if l.text.startswith('•')), len(body))
            intro = body[:first]
            levelUp = split_features([Line(l.page, l.col, l.x0, l.top, l.style, re.sub(r'^• ', '', l.text)) for l in body
                                      if l not in intro or FEATURE_START.match(re.sub(r'^• ', '', l.text))])
            levelUp = [f for f in levelUp if f['name']]
        elif head.startswith('STEP'):
            steps.append({'title': title(head), 'text': plain(join(body))})
        elif head or body:
            sections.append({'title': title(head) if head else '', 'text': plain(join(body))})
    return {'steps': steps, 'exampleExperiences': examples, 'rules': sections, 'levelUpOptions': levelUp}


def is_heading_text(s: str) -> bool:
    return s.startswith(('STEP', 'WORKING', 'LEVELING', 'USING', 'ATTACKING', 'TAKING', 'Example'))
