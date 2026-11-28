"""
At least one Instagram Reel every day (owner, 2026-11-25). Runs every evening (Pacific time); if no Reel went out
that day (Monday events, Wednesday new listings, Friday newsletter or a festival), it posts one of these, with
music and the usual end card:

  Tuesday   Listing spotlight: one directory listing with its picture and description, never the same one twice.
  Thursday  This weekend: Friday to Sunday gatherings, leaving out pictures already in Monday's Reel.
  Any other day, and whenever the above has nothing to show: that day's exercise from Rudolf Steiner's
            "For the days of the week" (GA 245), in Sophia Commons' own English (mobile/src/data/day-exercises.json).

  python3 automation/instagram_post.py preview --daily [--as spotlight|weekend|exercise]   # builds it; posts nothing
  python3 automation/instagram_post.py post --daily                                       # posts once, only if needed
"""
import json
import os
import re
import sys
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import requests
from PIL import Image, ImageDraw

from instagram_post import (CALENDAR_URL, CAPTION_MAX, H, HASHTAG_MAX, MAX_SLIDES, SITE, W, _pic_key, centered,
                            claim_check, clean, event_line, events_reel_pictures, frame_jpeg, ship, supabase)
from ig_more_reels import BG, CATEGORY_WORDS, GOLD, INK, SOFT, anthro, jpeg, listing_frame, wrap

PACIFIC = ZoneInfo('America/Los_Angeles')   # the owner's day: "one Reel a day" is counted in Pacific time
EXERCISES = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         'mobile', 'src', 'data', 'day-exercises.json')
WEEKEND_MIN = 2          # fewer new weekend pictures than this: the exercise instead
CHUNK_WORDS = 34         # words of text on one card (each card stays up twice as long, about 5.5 s)
SPOTLIGHT_WORDS = 70     # description words shown on the spotlight's cards
SITE_HOST = SITE.replace('https://', '')
KIND_LABEL = {'waldorf': 'Waldorf education', 'biodynamic': 'Biodynamic farming', 'camphill': 'Camphill community',
              'community': 'Community', 'christian_community': 'The Christian Community',
              'medicine': 'Anthroposophic medicine', 'eurythmy': 'Eurythmy and the arts',
              'societies': 'Anthroposophical society', 'eldercare': 'Eldercare'}


def today_pacific():
    return datetime.now(PACIFIC).date()


def posted_today(day):
    """True when a Reel was posted (or is being posted) on this Pacific day."""
    url, hd = supabase()
    start = datetime.combine(day, time(0), PACIFIC).astimezone(timezone.utc).isoformat()
    rows = requests.get(url + '/rest/v1/instagram_posts', headers=hd, timeout=30, params={
        'select': 'id', 'status': 'in.(posted,posting)', 'drafted_at': f'gte.{start}', 'limit': '1'}).json()
    if not isinstance(rows, list):
        sys.exit(f'Could not read instagram_posts: {rows}')
    return bool(rows)


def tags(*extra):
    return ' '.join(list(dict.fromkeys(['#Anthroposophy', *extra, '#SophiaCommons']))[:HASHTAG_MAX])


def text_card(lines, head=None, foot=None):
    """Lines of text centered on the site's ivory, with an optional gold heading and a small footer."""
    out = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(out)
    font, step = anthro(60), 86
    block = len(lines) * step + (130 if head else 0)
    y = (H - block) // 2 - 60
    if head:
        centered(draw, y, head, anthro(46, True), GOLD)
        draw.line((W // 2 - 60, y + 84, W // 2 + 60, y + 84), fill=GOLD, width=3)
        y += 130
    for i, line in enumerate(lines):
        centered(draw, y + i * step, line, font, INK)
    if foot:
        centered(draw, H - 330, foot, anthro(36), SOFT)
    return jpeg(out)


def chunks(text, words=CHUNK_WORDS):
    """Splits text into card-sized pieces, breaking after a sentence where it can."""
    sentences = re.split(r'(?<=[.;:!?])\s+', text.strip())
    out, cur = [], ''
    for s in sentences:
        trial = (cur + ' ' + s).strip()
        if cur and len(trial.split()) > words:
            out.append(cur)
            cur = s
        else:
            cur = trial
    if cur:
        out.append(cur)
    # a single sentence longer than a card is cut by words
    final = []
    for c in out:
        w = c.split()
        final += [' '.join(w[i:i + words + 8]) for i in range(0, len(w), words + 8)]
    return final


def card_lines(text):
    draw = ImageDraw.Draw(Image.new('RGB', (W, 10)))
    return wrap(draw, text, anthro(60), W - 190)


# ---------- the day's exercise ----------

def exercise_reel(day):
    data = json.load(open(EXERCISES, encoding='utf-8'))
    wd = (day.weekday() + 1) % 7        # the file counts Sunday as 0
    ex = next(x for x in data['days'] if x['day'] == wd)
    weekday = f'{day:%A}'
    out = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(out)
    centered(draw, 520, 'For the days of the week', anthro(52), SOFT)
    centered(draw, 650, weekday, anthro(120, True), INK)
    for i, line in enumerate(wrap(draw, ex['name'], anthro(78, True), W - 160)):
        centered(draw, 860 + i * 96, line, anthro(78, True), GOLD)
    centered(draw, 1080, ex['theme'], anthro(50), SOFT)
    centered(draw, H - 360, 'Rudolf Steiner, GA 245', anthro(40), SOFT)
    title = jpeg(out)
    frames = [title, title]
    for piece in chunks(' '.join(ex['text'])):
        card = text_card(card_lines(piece), head=ex['name'])
        frames += [card, card]
        if len(frames) >= MAX_SLIDES:
            break
    daily = data['daily']
    caption = '\n\n'.join([
        f"{weekday}: {ex['name'].lower()} ({ex['theme'].lower()})",
        *ex['text'],
        f"And every day, {daily['name'].lower()}: {daily['text'][0]}",
        f"From Rudolf Steiner's exercises for the days of the week (GA 245), in Sophia Commons' own English. "
        f"All eight are on {SITE_HOST}.",
        tags('#RudolfSteiner', '#Meditation', '#InnerWork'),
    ])
    row = {'kind': 'other', 'title': f'Day exercise: {weekday}, {ex["name"]}'}
    return row, frames[:MAX_SLIDES], caption


# ---------- listing spotlight ----------

def spotlighted():
    """Listing ids already in a spotlight (kept in the post titles)."""
    url, hd = supabase()
    rows = requests.get(url + '/rest/v1/instagram_posts', headers=hd, timeout=30, params={
        'select': 'title', 'id': 'like.daily-*', 'title': 'like.Listing spotlight*'}).json()
    return {m for r in (rows if isinstance(rows, list) else []) for m in re.findall(r'\[([0-9a-f-]{36})\]', r['title'] or '')}


def pick_listing():
    """A verified listing with a real picture (not a logo) and a description, never shown before."""
    url, hd = supabase()
    used = spotlighted()
    for verified in ('true', None):
        params = {'select': 'id,organization_name,location,country,category,photo_url,description,website_url',
                  'status': 'eq.approved', 'photo_url': 'not.is.null', 'description': 'not.is.null',
                  'category': 'neq.online',   # a real place: schools, farms, clinics, communities
                  'order': 'id', 'limit': '300'}
        if verified:
            params['is_verified'] = 'is.true'
        rows = requests.get(url + '/rest/v1/directory_entries', headers=hd, timeout=30, params=params).json()
        if not isinstance(rows, list):
            sys.exit(f'Could not read directory_entries: {rows}')
        for r in rows:
            desc = clean(r.get('description') or '')
            if r['id'] not in used and not r['photo_url'].endswith('#contain') and len(desc.split()) >= 15:
                return r
    return None


def spotlight_reel(day):
    r = pick_listing()
    if not r:
        return None
    name = clean(r['organization_name'])
    place = clean(r.get('location') or r.get('country') or '')
    kind = KIND_LABEL.get(r.get('category') or '', '')
    out = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(out)
    centered(draw, 560, 'Listing spotlight', anthro(56), SOFT)
    lines = wrap(draw, name, anthro(92, True), W - 150)[:3]
    for i, line in enumerate(lines):
        centered(draw, 690 + i * 112, line, anthro(92, True), INK)
    y = 690 + len(lines) * 112 + 40
    if place:
        centered(draw, y, place[:46], anthro(54), GOLD)
    if kind:
        centered(draw, y + 100, kind, anthro(44), SOFT)
    title = jpeg(out)
    try:
        photo = listing_frame(r)
    except Exception as err:
        print(f'spotlight picture unreadable ({err}); trying the exercise instead')
        return None
    frames = [title, title, photo, photo]
    desc = clean(r['description'])
    words = desc.split()
    shown = ' '.join(words[:SPOTLIGHT_WORDS]) + ('...' if len(words) > SPOTLIGHT_WORDS else '')
    for piece in chunks(shown):
        card = text_card(card_lines(piece), head=name if len(name) <= 30 else 'About them')
        frames += [card, card]
    body = desc if len(desc) <= 900 else desc[:880].rsplit(' ', 1)[0] + '...'
    caption = '\n\n'.join(filter(None, [
        f'Listing spotlight: {name}' + (f', {place}' if place else ''),
        body,
        f"sophiacommons.org/listing/{r['id']}",
        f"Their website: {r['website_url']}" if r.get('website_url') else '',
        f'One of thousands of schools, farms, clinics and communities in the free directory at {SITE_HOST}. '
        'Is yours listed?',
        tags(*(['#' + CATEGORY_WORDS[r['category']].title().replace(' ', '')] if CATEGORY_WORDS.get(r.get('category') or '') else []),
             '#RudolfSteiner'),
    ]))
    row = {'kind': 'other', 'title': f"Listing spotlight: {name} [{r['id']}]"}
    return row, frames[:MAX_SLIDES], caption


# ---------- this weekend ----------

def weekend_reel(day):
    fri = day + timedelta(days=(4 - day.weekday()) % 7)
    sun = fri + timedelta(days=2)
    url, hd = supabase()
    evs = requests.get(url + '/rest/v1/events', headers=hd, timeout=30, params={
        'select': 'id,title,title_en,is_online,city,start_date,image_url',
        'status': 'in.(upcoming,ongoing)', 'order': 'featured.desc,start_date.asc', 'limit': '300',
        'and': f'(start_date.gte.{fri:%Y-%m-%d},start_date.lt.{sun + timedelta(days=1):%Y-%m-%d})'}).json()
    if not isinstance(evs, list):
        print(f'Could not read events: {evs}')
        return None
    shown = events_reel_pictures(day - timedelta(days=day.weekday()))
    pics, seen = [], set()
    for e in evs:
        src = e.get('image_url')
        if not src or 'festivals/' in src or _pic_key(src) in shown or _pic_key(src) in seen:
            continue
        seen.add(_pic_key(src))
        try:
            pics.append(frame_jpeg(src))
        except Exception as err:
            print(f'skip picture for {e["id"][:8]}: {err}')
        if len(pics) == MAX_SLIDES - 2:
            break
    if len(pics) < WEEKEND_MIN:
        print(f'{len(pics)} new weekend pictures (fewer than {WEEKEND_MIN}); the exercise instead.')
        return None
    out = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(out)
    centered(draw, 640, 'This weekend', anthro(120, True), INK)
    centered(draw, 820, f'{fri:%B} {fri.day} to {sun:%B} {sun.day}' if fri.month != sun.month else f'{fri:%B} {fri.day} to {sun.day}',
             anthro(62, True), GOLD)
    centered(draw, 940, f'{len(evs)} gatherings, in person and online', anthro(50), SOFT)
    title = jpeg(out)
    blocks = [f"{event_line(e)}\nsophiacommons.org/event/{e['id']}" for e in sorted(evs, key=lambda e: e['start_date'])]
    head = f'This weekend on the Sophia Commons calendar: {len(evs)} gatherings, in person and online.'
    end = [f'The full calendar: {CALENDAR_URL}', tags('#Events', '#Waldorf', '#RudolfSteiner')]
    while blocks and len('\n\n'.join([head, *blocks, *end])) > CAPTION_MAX:
        blocks.pop()
    row = {'kind': 'other', 'title': f'This weekend, {fri} ({len(evs)} events)', 'event_ids': [e['id'] for e in evs][:20]}
    return row, [title, title] + pics, '\n\n'.join([head, *blocks[:12], *end])


# ---------- the daily run ----------

PLAN = {1: 'spotlight', 3: 'weekend'}   # Python weekday numbers: Tuesday, Thursday; every other day the exercise
MAKERS = {'spotlight': spotlight_reel, 'weekend': weekend_reel, 'exercise': exercise_reel}


def run_daily(cmd, force=None):
    day = today_pacific()
    post_id = f'daily-{day}'
    if cmd == 'post':
        if posted_today(day):
            print(f'A Reel already went out on {day}; nothing more needed.')
            return
        claim_check(post_id)
    kind = force or PLAN.get(day.weekday(), 'exercise')
    made = MAKERS[kind](day)
    if made is None and kind != 'exercise':
        made = exercise_reel(day)
    row, frames, caption = made
    ship(cmd, {**row, 'id': post_id}, frames, caption, post_id)
