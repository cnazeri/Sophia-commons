"""
Two more Instagram Reels, both with music and the usual end card (owner, 2026-11-23):

  Festival Reels: Advent, Epiphany, Easter, St. John's and Michaelmas, posted 1 to 3 days before the day
  (the daily run posts the first time it falls in that window; the claim in instagram_posts stops a second post).
  Frames: a title card over the festival's painting, the painting itself, then pictures of festival
  gatherings on the calendar around that day.

  New this week: on Wednesdays, the listings added to the directory in the last 7 days, as
  "17 new listings in 5 countries" over a map drawn from every listing's location (the new ones in gold),
  then a picture of each new listing that has one.

  python3 automation/instagram_post.py preview --festival   # the next festival, whenever it is; posts nothing
  python3 automation/instagram_post.py post --festival      # posts only 1 to 3 days before a festival, once
  python3 automation/instagram_post.py preview --new        # this week's new listings; posts nothing
  python3 automation/instagram_post.py post --new           # posts them once (needs at least NEW_MIN)
"""
import io
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone

import requests
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

from instagram_post import (ASSETS, BASE_TAG, BIO_LINE, CALENDAR_URL, CAPTION_MAX, H, MAX_SLIDES, SITE, W,
                            centered, claim_check, clean, event_line, frame_jpeg, hashtags, ship, supabase)

FEST_PICS = os.path.join(ASSETS, 'festivals')   # classic and anthroposophical works, public domain or credited
FESTIVAL_DAYS_AHEAD = (1, 3)   # post this many days before the festival
FESTIVAL_EVENTS_MAX = 6        # gatherings shown after the painting
NEW_DAYS = 7
NEW_MIN = 3                    # fewer new listings than this: no post that week
NEW_LISTED = 12                # listings named in the caption
CATEGORY_WORDS = {'waldorf': 'waldorf', 'biodynamic': 'biodynamic', 'camphill': 'camphill', 'community': 'camphill',
                  'christian_community': 'christian community', 'medicine': 'anthroposophic medicine',
                  'eurythmy': 'eurythmy', 'online': 'rudolf steiner', 'societies': 'rudolf steiner'}
BG, INK, GOLD, SOFT = '#FDFBF7', '#1E1810', '#7F6116', '#5A4E42'   # the site's --bg, --text-primary, --gold-text, --text-secondary


def easter(year):
    """Gregorian Easter Sunday (anonymous algorithm), as the site works it out."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    g = (8 * b + 13) // 25
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    return date(year, month, (h + l - 7 * m + 114) % 31 + 1)


def advent_sunday(year):
    """First Sunday of Advent: the fourth Sunday before Christmas Day."""
    xmas = date(year, 12, 25)
    return xmas - timedelta(days=(xmas.weekday() + 1) % 7 or 7) - timedelta(weeks=3)


# Each festival's pictures (owner, 2026-11-23: classic and anthroposophical works; all credited in the caption)
FESTIVALS = [
    {'key': 'epiphany', 'name': 'Epiphany', 'when': lambda y: date(y, 1, 6), 'tag': '#Epiphany',
     'pics': [('epiphany-1-magi-gentile.jpg', 'Adoration of the Magi, Gentile da Fabriano (1423)'), ('epiphany-2-magi-burne-jones.jpg', 'The Adoration of the Magi, Edward Burne-Jones (tapestry, 1894)'), ('epiphany-3-seal-sun-woman.jpg', "Rudolf Steiner's seal of the woman clothed with the sun, painted by Clara Rettich")],
     'words': r'epiphany|three kings|holy nights|dreik', 'line': 'The close of the Twelve Holy Nights',
     'text': 'Epiphany closes the Twelve Holy Nights. The light of Christmas is carried out into the new year, '
             'as the three kings carried their gifts home by another way.'},
    {'key': 'easter', 'name': 'Easter', 'when': easter, 'tag': '#Easter',
     'pics': [('easter-1-resurrection.jpg', 'The Resurrection, Isenheim Altarpiece, Matthias Grunewald (1512-1516)'), ('easter-2-seal-resurrection.jpg', "Rudolf Steiner's seal of the resurrection, painted by Clara Rettich")],
     'words': r'easter|oster|holy week|good friday|resurrection', 'line': 'The festival of the Resurrection',
     'text': 'Easter falls on the first Sunday after the first full moon of spring, a date set by sun and moon '
             'together, which Rudolf Steiner spoke about in his Easter lectures of 1924.'},
    {'key': 'johanni', 'name': "St. John's Tide", 'when': lambda y: date(y, 6, 24), 'tag': '#Midsummer',
     'pics': [('johanni-1-leonardo.jpg', 'Saint John the Baptist, Leonardo da Vinci (c. 1513-1516)'), ('johanni-2-isenheim-john.jpg', 'John the Baptist, Isenheim Altarpiece, Matthias Grunewald'), ('johanni-3-fire.jpg', "St. John's fire, Walter J. Pilsak, CC BY-SA 3.0")],
     'words': r"st\.? john'?s|johanni|midsummer", 'line': 'Midsummer and John the Baptist',
     'text': "St. John's Tide, the festival of John the Baptist near midsummer. Steiner described it as the "
             'time when the Earth breathes out most fully into the cosmos. Many communities gather round a fire.'},
    {'key': 'michaelmas', 'name': 'Michaelmas', 'when': lambda y: date(y, 9, 29), 'tag': '#Michaelmas',
     'pics': [('michaelmas-1-raphael.jpg', 'St. Michael and the Dragon, Raphael (c. 1505)'), ('michaelmas-2-reni.jpg', 'The Archangel Michael, Guido Reni (1635)'), ('michaelmas-3-goetheanum-red-window.jpg', 'The red window of the Goetheanum, designed by Rudolf Steiner. Photo: Taxiarchos228, Free Art License')],
     'words': r'michael(mas)?\b|michaeli', 'line': 'The festival of courage',
     'text': 'The festival of the Archangel Michael at the turn to autumn. Steiner hoped it would become a '
             'festival of courage and inner strength, just as nature dies back.'},
    {'key': 'advent', 'name': 'Advent', 'when': advent_sunday, 'tag': '#Advent',
     'pics': [('advent-1-annunciation.jpg', 'The Annunciation, Fra Angelico (c. 1434)'), ('advent-2-sistine-madonna.jpg', 'The Sistine Madonna, Raphael (1512)'), ('advent-3-wreath.jpg', 'Advent wreath, Philip Janos, CC0')],
     'words': r'\badvent\b|advent garden|advent spiral', 'line': 'The first Sunday of Advent',
     'text': 'Four Sundays of waiting and preparing, with one more candle lit each week, as the light is carried '
             'toward Christmas through the darkest weeks of the year. In Waldorf schools, the Advent garden.',
     # Owner, 2026-11-23: a Steiner quote in the Advent Reel. Wording checked against rsarchive.org (GA 260, Adams).
     'quote': ['At the turning-point of time,', 'The Spirit-Light of the World', 'Entered the stream',
               'of Earthly Evolution.', 'Darkness of Night', 'Had held its sway;', 'Day-radiant Light',
               'Poured into the souls of men.'],
     'quote_src': 'Rudolf Steiner, The Foundation Stone Meditation (Christmas 1923), tr. George Adams'},
]


def anthro(size, bold=False):
    return ImageFont.truetype(os.path.join(ASSETS, 'Anthro-Bold.ttf' if bold else 'Anthro-Regular.ttf'), size)


def wrap(draw, text, font, width):
    """Breaks text into lines that fit the width."""
    lines, line = [], ''
    for word in text.split():
        trial = (line + ' ' + word).strip()
        if line and draw.textlength(trial, font=font) > width:
            lines.append(line)
            line = word
        else:
            line = trial
    return lines + ([line] if line else [])


def jpeg(img):
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=92)
    return buf.getvalue()


def fetch_image(url):
    r = requests.get(url, timeout=30, headers={'User-Agent': 'SophiaCommons/1.0'})
    r.raise_for_status()
    return ImageOps.exif_transpose(Image.open(io.BytesIO(r.content))).convert('RGB')


def nice_date(d):
    return f'{d:%A, %B} {d.day}'


# ---------- Festival Reels ----------

def picture_frame(im):
    """A painting shown whole on a 1080x1920 frame, over a blurred, dimmed copy of itself (as frame_jpeg)."""
    out = ImageOps.fit(im, (W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(40))
    out = Image.blend(out, Image.new('RGB', (W, H), 'black'), 0.35)
    im = ImageOps.contain(im, (W, H), Image.LANCZOS)
    out.paste(im, ((W - im.width) // 2, (H - im.height) // 2))
    return jpeg(out)


def next_festival(today, window=None):
    """The festival (with its date) that is next; with a window, only one that many days ahead."""
    found = []
    for f in FESTIVALS:
        for y in (today.year, today.year + 1):
            day = f['when'](y)
            ahead = (day - today).days
            if ahead >= 0 and (window is None or window[0] <= ahead <= window[1]):
                found.append((day, f))
                break
    return min(found, key=lambda p: p[0]) if found else (None, None)


def festival_card(fest, day, painting):
    """Title card: the festival's name, its date and a line over a dimmed copy of its painting."""
    out = ImageOps.fit(painting, (W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(30))
    out = Image.blend(out, Image.new('RGB', (W, H), '#120E08'), 0.62)
    draw = ImageDraw.Draw(out)
    centered(draw, 640, fest['name'], anthro(132, True), '#FFFFFF')
    centered(draw, 830, nice_date(day), anthro(64, True), '#E8C872')
    for i, line in enumerate(wrap(draw, fest['line'], anthro(54), W - 200)):
        centered(draw, 960 + i * 72, line, anthro(54), '#F2ECE2')
    centered(draw, 1500, 'Festivals of the year', anthro(42), '#D8CFC2')
    return jpeg(out)


def quote_card(fest, painting):
    """A Rudolf Steiner quote over a dimmed copy of a painting, with its source beneath."""
    out = ImageOps.fit(painting, (W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(30))
    out = Image.blend(out, Image.new('RGB', (W, H), '#120E08'), 0.66)
    draw = ImageDraw.Draw(out)
    lines, step = fest['quote'], 84
    y = (H - len(lines) * step) // 2 - 120
    for i, line in enumerate(lines):
        centered(draw, y + i * step, line, anthro(60), '#FFFFFF')
    src = wrap(draw, fest['quote_src'], anthro(38), W - 220)
    for i, line in enumerate(src):
        centered(draw, y + len(lines) * step + 70 + i * 52, line, anthro(38), '#E8C872')
    return jpeg(out)


def festival_events(fest, day):
    """Gatherings on the calendar from 3 days before to 7 days after, that name the festival."""
    url, hd = supabase()
    rows = requests.get(url + '/rest/v1/events', headers=hd, timeout=30, params={
        'select': 'id,title,title_en,description,description_en,is_online,city,start_date,image_url',
        'status': 'in.(upcoming,ongoing)', 'order': 'featured.desc,start_date.asc', 'limit': '500',
        'and': f'(start_date.gte.{day - timedelta(days=3):%Y-%m-%d},start_date.lte.{day + timedelta(days=7):%Y-%m-%d})'}).json()
    if not isinstance(rows, list):
        sys.exit(f'Could not read events: {rows}')
    rx = re.compile(fest['words'], re.I)
    return [e for e in rows if rx.search(' '.join(str(e.get(k) or '') for k in ('title', 'title_en', 'description_en')))]


def festival_caption(fest, day, evs):
    head = f"{fest['name']} is on {nice_date(day)}.\n\n{fest['text']}"
    if fest.get('quote'):
        head += '\n\n' + '\n'.join(fest['quote']) + f"\n({fest['quote_src']})"
    blocks = [f"{event_line(e)}\nsophiacommons.org/event/{e['id']}" for e in sorted(evs, key=lambda e: e['start_date'])[:8]]
    gather = ['Gatherings on the calendar:', *blocks] if blocks else []
    tags = ' '.join(dict.fromkeys([BASE_TAG, fest['tag'], '#Festivals', '#RudolfSteiner', '#SophiaCommons']))
    credits = 'Pictures: ' + '; '.join(c for _, c in fest['pics']) + '.'
    parts = [head, *gather, f'Find a festival near you: {CALENDAR_URL}', credits, BIO_LINE, tags]
    text = '\n\n'.join(parts)
    while len(text) > CAPTION_MAX and len(gather) > 1:
        gather.pop()
        text = '\n\n'.join([head, *gather, *parts[-4:]])
    return text


def run_festival(cmd):
    today = datetime.now(timezone.utc).date()
    day, fest = next_festival(today, FESTIVAL_DAYS_AHEAD if cmd == 'post' else None)
    if not fest:
        print('No festival in the next few days; nothing posted.')
        return
    post_id = f"festival-{fest['key']}-{day.year}"
    if cmd == 'post':
        claim_check(post_id)
    paintings = [Image.open(os.path.join(FEST_PICS, f)).convert('RGB') for f, _ in fest['pics']]
    frames = [festival_card(fest, day, paintings[0])] + [picture_frame(im) for im in paintings]
    if fest.get('quote'):   # after the first painting; shown twice as long so it can be read (about 5.5 s)
        q = quote_card(fest, paintings[1] if len(paintings) > 1 else paintings[0])
        frames[2:2] = [q, q]
    evs = festival_events(fest, day)
    seen = set()
    for e in evs:
        src = e.get('image_url')
        if not src or src in seen or 'festivals/' in src:
            continue
        seen.add(src)
        try:
            frames.append(frame_jpeg(src))
        except Exception as err:
            print(f'skip picture for {e["id"][:8]}: {err}')
        if len(frames) >= MAX_SLIDES:
            break
    row = {'id': post_id, 'kind': 'other', 'title': f"{fest['name']} {day.year}", 'event_ids': [e['id'] for e in evs][:20]}
    ship(cmd, row, frames, festival_caption(fest, day, evs), post_id)


# ---------- New this week ----------

def _paged(table, params):
    url, hd = supabase()
    out, start = [], 0
    while True:
        rows = requests.get(f'{url}/rest/v1/{table}', timeout=60, params=params,
                            headers={**hd, 'Range': f'{start}-{start + 999}'}).json()
        if not isinstance(rows, list):
            sys.exit(f'Could not read {table}: {rows}')
        out += rows
        if len(rows) < 1000:
            return out
        start += 1000


def new_listings(since):
    return _paged('directory_entries', {
        'select': 'id,organization_name,location,country,category,photo_url,latitude,longitude',
        'status': 'eq.approved', 'created_at': f'gte.{since.isoformat()}', 'order': 'created_at.desc'})


def world_points():
    rows = _paged('directory_entries', {'select': 'latitude,longitude', 'status': 'eq.approved', 'latitude': 'not.is.null'})
    return [(r['latitude'], r['longitude']) for r in rows if r['longitude'] is not None]


def map_card(new, points):
    """'New this week', the count, and a world map drawn from every listing's place (new ones in gold)."""
    out = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(out)
    countries = {r['country'] for r in new if r.get('country')}
    centered(draw, 330, 'New this week', anthro(96, True), INK)
    count = f'{len(new)} new listings' + (f' in {len(countries)} countries' if len(countries) > 1 else '')
    centered(draw, 480, count, anthro(58, True), GOLD)
    my = 600
    my = _draw_map(out, my, new, points)
    draw.text((W // 2, my + 30), 'Gold: new this week.  Grey: every listing on Sophia Commons.',
              font=anthro(32), fill=SOFT, anchor='mt')
    names = [clean(r['organization_name']) for r in new][:6]
    y0 = my + 130
    for i, n in enumerate(names):
        centered(draw, y0 + i * 66, n if len(n) <= 38 else n[:36].rstrip() + '...', anthro(44), SOFT)
    if len(new) > len(names):
        centered(draw, y0 + len(names) * 66, f'and {len(new) - len(names)} more', anthro(44), SOFT)
    return jpeg(out)


def _land():
    """Coastlines: Natural Earth 1:110m land (public domain), in automation/ig_assets/."""
    import json
    shapes = []
    for f in json.load(open(os.path.join(ASSETS, 'ne_110m_land.geojson')))['features']:
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        shapes += [p[0] for p in polys]   # outer rings only; the few lakes do not show at this size
    return shapes


def _draw_map(out, y, new, points):
    """A world map, 75N to 50S, at true proportions (one degree as wide as tall): land in the site's sand
    color, every listing as a small grey dot, this week's new ones in gold. Drawn 4x, then scaled down.
    Returns the y below the map."""
    west, east, top, bottom = -170.0, 180.0, 75.0, -50.0
    mw = W - 40
    mh = round(mw * (top - bottom) / (east - west))
    s = 4
    layer = Image.new('RGBA', (mw * s, mh * s), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    xy = lambda lat, lng: ((lng - west) / (east - west) * mw * s, (top - lat) / (top - bottom) * mh * s)
    for ring in _land():
        ld.polygon([xy(lat, lng) for lng, lat in ring], fill=(226, 214, 192, 255), outline=(196, 182, 156, 255), width=4)
    for lat, lng in points:
        if bottom <= lat <= top and west <= lng <= east:
            x, yy = xy(lat, lng)
            ld.ellipse((x - 7, yy - 7, x + 7, yy + 7), fill=(98, 84, 66, 200))
    for r in new:
        if r.get('latitude') is not None and r.get('longitude') is not None:
            x, yy = xy(r['latitude'], r['longitude'])
            ld.ellipse((x - 48, yy - 48, x + 48, yy + 48), fill=(201, 162, 39, 110))
            ld.ellipse((x - 24, yy - 24, x + 24, yy + 24), fill=(166, 124, 0, 255), outline=(255, 255, 255, 255), width=6)
    layer = layer.resize((mw, mh), Image.LANCZOS)
    out.paste(layer, (20, y), layer)
    return y + mh


def listing_frame(r):
    """The listing's picture with its name and place in a band along the bottom."""
    img = Image.open(io.BytesIO(frame_jpeg(r['photo_url']))).convert('RGB')
    band = Image.new('RGBA', (W, 300), (18, 14, 8, 200))
    img.paste(band, (0, H - 420), band)
    draw = ImageDraw.Draw(img)
    name = clean(r['organization_name'])
    lines = wrap(draw, name, anthro(56, True), W - 120)[:2]
    for i, line in enumerate(lines):
        centered(draw, H - 390 + i * 70, line, anthro(56, True), '#FFFFFF')
    place = clean(r.get('location') or r.get('country') or '')
    if place:
        centered(draw, H - 390 + len(lines) * 70 + 14, place[:44], anthro(42), '#E8C872')
    return jpeg(img)


def new_caption(new, listed=NEW_LISTED):
    countries = {r['country'] for r in new if r.get('country')}
    head = f'{len(new)} new listings joined the Sophia Commons directory this week'
    head += f', in {len(countries)} countries.' if len(countries) > 1 else '.'
    blocks = []
    for r in new[:listed]:
        place = clean(r.get('location') or r.get('country') or '')
        blocks.append(clean(r['organization_name']) + (f' ({place})' if place else '') + f"\nsophiacommons.org/listing/{r['id']}")
    more = [f'...and {len(new) - listed} more in the directory.'] if len(new) > listed else []
    # Tags from the listings' categories only: names give false hits ('Michaeliten' is not Michaelmas)
    blob = ' '.join(CATEGORY_WORDS.get(r.get('category') or '', '') for r in new)
    tags = ' '.join(hashtags(blob, last='#SophiaCommons'))
    ask = f'Know a school, farm, clinic or community that belongs here? Add it free at {SITE.replace("https://", "")}.'
    text = '\n\n'.join([head, *blocks, *more, ask, 'The directory and map are linked in our bio.', tags])
    if len(text) > CAPTION_MAX and listed > 1:
        return new_caption(new, listed - 1)
    return text


def run_new(cmd):
    now = datetime.now(timezone.utc)
    monday = (now - timedelta(days=now.weekday())).date()
    post_id = f'new-listings-{monday}'
    if cmd == 'post':
        claim_check(post_id)
    new = new_listings(now - timedelta(days=NEW_DAYS))
    if len(new) < NEW_MIN:
        print(f'{len(new)} new listings this week (fewer than {NEW_MIN}); nothing posted.')
        return
    card = map_card(new, world_points())
    frames = [card, card]   # the map stays up twice as long (about 5.5 s)
    for r in new:
        if not r.get('photo_url'):
            continue
        try:
            frames.append(listing_frame(r))
        except Exception as err:
            print(f'skip picture for {r["id"][:8]}: {err}')
        if len(frames) == MAX_SLIDES:
            break
    row = {'id': post_id, 'kind': 'other', 'title': f'New listings, week of {monday} ({len(new)})'}
    ship(cmd, row, frames, new_caption(new), post_id)
