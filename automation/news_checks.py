"""Plain checks shared by news_roundup.py and news_review.py (owner, 2026-11-13).

same_story(): two headlines about one event, worded differently by two publishers
  ("Richmond Council OKs Waldorf School Land Purchase" / "City Council OKs Waldorf School purchase of
  triangle of land off Brookland Parkway"). Exact-title matching missed these.
fix_missing_times(): a page that renders its times with script leaves "from a. m. to p. m." in the
  text we read; drop the empty time phrase instead of printing it.
"""
import re

# Words every story in our field shares; they say nothing about whether two stories are the same
COMMON = set('''a an the and or of in on at to for from by with as is are was were be its it this that new
    waldorf steiner school schools camphill biodynamic anthroposophical anthroposophy community city
    annual year years first back brings bring s'''.split())


def _words(title: str) -> set:
    return {w for w in re.findall(r'[a-z0-9]+', (title or '').lower()) if w not in COMMON and len(w) > 1}


def same_story(a: str, b: str) -> bool:
    """True when the shorter headline's distinctive words are mostly in the other one."""
    wa, wb = _words(a), _words(b)
    if not wa or not wb:
        return False
    shared = wa & wb
    return len(shared) >= 3 and len(shared) / min(len(wa), len(wb)) >= 0.75


_AMPM = r'[ap]\.?\s?m\.?'
_EMPTY_RANGE = re.compile(r'\s*\bfrom\s+' + _AMPM + r'\s+(?:to|until|-)\s+' + _AMPM + r'(?=[\s,.;])', re.I)
_EMPTY_AT = re.compile(r'\s*\b(?:at|by|until)\s+' + _AMPM + r'(?=[\s,.;])', re.I)


def fix_missing_times(text: str) -> str:
    """Remove time phrases whose numbers went missing; leave real times like '10 a.m.' alone."""
    t = _EMPTY_RANGE.sub('', text or '')
    t = _EMPTY_AT.sub('', t)
    return re.sub(r'\s+([,.;])', r'\1', t)
