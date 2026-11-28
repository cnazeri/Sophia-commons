#!/usr/bin/env python3
"""
Weekly Instagram Reel of this week's events, with music (owner, 2026-11-23; Reel instead of carousel the same day).
On Fridays the newest weekly newsletter also becomes a Reel (its own pictures, a short summary, its link): --newsletter.

Every Monday, the same week as the X events post: up to 10 events that start Monday to Sunday and have a
picture become a vertical slideshow (1080x1920, 3 s per picture with soft fades), set to a music track from
automation/ig_music/ (the next one after the last Reel's, never the same twice in a row; royalty-free or public domain only), stored in
social/instagram/<monday>/reel.mp4 and posted as a Reel (always ending on the logo and sophiacommons.org), with a caption that lists the events, points to the calendar (links in captions are not clickable on
Instagram, so "link in bio") and ends with hashtags. Posts on its own, never twice: the week's row in
instagram_posts is claimed before publishing (backend/migrations/RUN_THIS_2026-11-23_instagram_posts.sql).

  python3 automation/instagram_post.py preview        # build caption and reel.mp4 in automation/ig_preview/, post nothing
  python3 automation/instagram_post.py post           # build, upload, publish (skips a week that already went out)
  python3 automation/instagram_post.py post --next    # next week instead of this week
  python3 automation/instagram_post.py preview --newsletter   # the newest sent newsletter as a Reel, post nothing
  python3 automation/instagram_post.py post --newsletter      # post it (only if sent in the last 4 days; once)

Needs ffmpeg. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY),
     IG_USER_ID (the Instagram Business account id), IG_ACCESS_TOKEN (long-lived; a System User token never expires),
     IG_GRAPH_VERSION (optional, default below).
"""
import argparse
import glob
import html
import io
import os
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone

import requests
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from x_post import BASE_TAG, EVENTS_TAG, MODEL, TAGS, clean, latest_issue, load_env, plain, supabase  # noqa: E402  same helpers as the X posts

HERE = os.path.dirname(os.path.abspath(__file__))
PREVIEW = os.path.join(HERE, 'ig_preview')
MUSIC = os.path.join(HERE, 'ig_music')
ASSETS = os.path.join(HERE, 'ig_assets')   # the website's logo mark and header font, for the end card
GRAPH = 'https://graph.facebook.com/' + os.environ.get('IG_GRAPH_VERSION', 'v23.0')
W, H = 1080, 1920          # Reels are 9:16
MAX_SLIDES = 10
SLIDE_S = 3.0              # seconds per picture
FADE_S = 0.5               # cross-fade between pictures
CAPTION_MAX = 2200
LISTED_MAX = 12            # events named in the caption
CALENDAR_URL = 'https://sophiacommons.org/events'
BIO_LINE = 'Tap the link in our bio for the full calendar.'
SITE = 'https://sophiacommons.org'
NEWSLETTER_TAG = '#SophiaCommons'
NEWSLETTER_MAX_AGE = timedelta(days=4)   # only an issue sent this week; an old one is never posted
HASHTAG_MAX = 5            # Instagram caps hashtags at 5 per post (Dec 2025); more can make the post fail
# Topic tags for the week's events (on top of the X list), chosen by how often each topic comes up that week
IG_TAGS = TAGS + [
    ('#SpiritualScience', r'spiritual science|geisteswissenschaft'),
    ('#Goethe', r'\bgoethe'),
    ('#Michaelmas', r'michaelmas|michaeli'),
    ('#Christmas', r'christmas|weihnacht|nativity'),
    ('#Meditation', r'meditat'),
    ('#Festivals', r'\bfestival'),
]


def hashtags(blob, last=EVENTS_TAG):
    """#Anthroposophy, up to three topic tags the text mentions most, and a closing tag (5 in all)."""
    low = blob.lower()
    hits = sorted(((len(re.findall(rx, low)), tag) for tag, rx in IG_TAGS), reverse=True)
    topics = [tag for n, tag in hits if n > 0 and tag not in (BASE_TAG, last)][:HASHTAG_MAX - 2]
    return [BASE_TAG, *topics, last]


def week_events(monday):
    """Public events that start Monday to Sunday, featured first, then by date."""
    url, H = supabase()
    end = monday + timedelta(days=7)
    rows = requests.get(url + '/rest/v1/events', headers=H, timeout=30, params={
        'select': 'id,title,title_en,description,description_en,is_online,city,featured,start_date,image_url',
        'status': 'in.(upcoming,ongoing)', 'and': f'(start_date.gte.{monday:%Y-%m-%d},start_date.lt.{end:%Y-%m-%d})',
        'order': 'featured.desc,start_date.asc', 'limit': '500'}).json()
    if not isinstance(rows, list):
        sys.exit(f'Could not read events: {rows}')
    return rows


def event_line(e):
    title = clean(e.get('title_en') or e['title'])
    if len(title) > 80:
        title = title[:77].rstrip() + '...'
    day = datetime.fromisoformat(e['start_date'][:10]).strftime('%a %b %-d')
    where = 'online' if e.get('is_online') else e.get('city') or ''
    return f'{day}: {title}' + (f' ({where})' if where else '')


def caption(evs, listed=LISTED_MAX):
    """Count line, each event with its own page link underneath (owner, 2026-11-23), calendar line, hashtags.
    Instagram does not make caption links clickable, but people can copy them. Lists fewer events
    when the caption would pass Instagram's 2,200 characters."""
    online = sum(1 for e in evs if e.get('is_online'))
    head = f'{len(evs)} anthroposophical events this week on Sophia Commons'
    head += f', {online} of them online.' if online else '.'
    head += f'\n\nThe full calendar: {CALENDAR_URL}'
    by_date = sorted(evs, key=lambda e: e['start_date'])
    blocks = [f"{event_line(e)}\nsophiacommons.org/event/{e['id']}" for e in by_date[:listed]]
    more = [f'...and {len(evs) - listed} more on the calendar.'] if len(evs) > listed else []
    blob = ' '.join((e.get('title_en') or e['title']) + ' ' + (e.get('description_en') or e.get('description') or '') for e in evs)
    tags = ' '.join(hashtags(blob))
    text = '\n\n'.join([head, *blocks, *more, BIO_LINE, tags])
    if len(text) > CAPTION_MAX and listed > 1:
        return caption(evs, listed - 1)
    return text


SUMMARY_MAX = 260


def newsletter_summary(issue):
    """Two clean sentences naming the issue's main stories (owner, 2026-11-23: the shared X wording came out
    clunky). Falls back to the issue's own summary when Claude is not available."""
    fallback = clean(issue.get('excerpt') or '')
    key = os.environ.get('ANTHROPIC_API_KEY')
    if not key:
        return fallback
    prompt = ("Below is this week's newsletter from Sophia Commons, a free directory of the anthroposophical community. "
              f"Write two short sentences for an Instagram caption, {SUMMARY_MAX} characters at most in total, that name the "
              "two or three most interesting things in this issue (a news story, an event, a new video or place), with "
              "concrete names. Plain, warm, factual. Do not mention Sophia Commons, the newsletter or 'this week's issue'; "
              "do not thank the reader; no hashtags, links, emoji, exclamation marks, em or en dashes, or filler words "
              "like 'delve'. Return only the two sentences.\n\n"
              f"TITLE: {issue['title']}\nSUMMARY: {issue.get('excerpt') or ''}\n\nTEXT:\n{plain(issue['body'])[:12000]}")
    try:
        r = requests.post('https://api.anthropic.com/v1/messages', timeout=90,
                          headers={'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
                          json={'model': MODEL, 'max_tokens': 1500, 'messages': [{'role': 'user', 'content': prompt}]})
        r.raise_for_status()
        out = clean(''.join(b.get('text', '') for b in r.json().get('content', []) if b.get('type') == 'text')).strip('"')
        return out if 30 <= len(out) <= SUMMARY_MAX + 40 else fallback
    except (requests.RequestException, ValueError) as err:
        print(f'Claude unavailable ({err}); using the issue summary.')
        return fallback


def newsletter_caption(issue):
    """The weekly newsletter (owner, 2026-11-23): two sentences about the issue (as on X), where to read it,
    how to get it by email, the bio line and 5 hashtags."""
    text = '\n\n'.join([
        f"This week's Sophia Commons newsletter is out. {newsletter_summary(issue)}".strip(),
        f"Read it here: {SITE}/article/{issue['id']}",
        f'Get it free by email every week: {SITE}',
        'The newsletter and the full calendar are linked in our bio.',
        ' '.join(hashtags(issue['title'] + ' ' + plain(issue['body']), NEWSLETTER_TAG)),
    ])
    return text[:CAPTION_MAX]


def _pic_key(url):
    """The same picture under different sizes or links: compare the last two parts of its path."""
    path = html.unescape(url).split('#')[0].split('?')[0]
    return '/'.join(path.rstrip('/').split('/')[-2:]).lower()


def events_reel_pictures(monday):
    """The pictures Monday's events Reel shows (the same picks as slides(), without downloading them)."""
    keys = []
    for e in week_events(monday):
        src = e.get('image_url')
        if src and _pic_key(src) not in keys:
            keys.append(_pic_key(src))
        if len(keys) == MAX_SLIDES:
            break
    return set(keys)


def newsletter_card(issue):
    """Opening frame, a clip of the newsletter itself (owner, 2026-11-23): the logo, 'The weekly newsletter',
    its date and the issue's section headings, in the site's colors."""
    out = Image.new('RGB', (W, H), '#FDFBF7')
    mark = Image.open(os.path.join(ASSETS, 'logo-mark.png')).convert('RGBA')
    mark = mark.resize((round(mark.width * 240 / mark.height), 240), Image.LANCZOS)
    out.paste(mark, ((W - mark.width) // 2, 250), mark)
    draw = ImageDraw.Draw(out)
    display = ImageFont.truetype(os.path.join(ASSETS, 'SophiaCommonsDisplay.ttf'), 104)
    # The Anthro typeface (owner, 2026-11-23) for the newsletter text: it has the digits, commas and colons
    # the display font lacks. '&' is the one character it does not have.
    anthro = lambda size, bold=False: ImageFont.truetype(os.path.join(ASSETS, 'Anthro-Bold.ttf' if bold else 'Anthro-Regular.ttf'), size)
    centered(draw, 580, 'The weekly newsletter', display, '#1E1810')
    sent = datetime.fromisoformat(issue['published_at'].replace('Z', '+00:00'))
    centered(draw, 740, f'{sent:%B} {sent.day}, {sent.year}', anthro(58, True), '#7F6116')
    heads = [clean(html.unescape(re.sub(r'<[^>]+>', '', h))) for h in re.findall(r'(?is)<h[23][^>]*>(.*?)</h[23]>', issue['body'])]
    heads = [h.replace('&', 'and') for h in heads if h][:8]
    if heads:
        centered(draw, 900, 'In this issue', anthro(46), '#5A4E42')
        for i, h in enumerate(heads):
            centered(draw, 990 + i * 92, h if len(h) <= 34 else h[:32] + '...', anthro(62, True), '#1E1810')
    buf = io.BytesIO()
    out.save(buf, 'JPEG', quality=92)
    return buf.getvalue()


def newsletter_slides(issue):
    """The opening card, then up to 9 of the issue's own pictures. Pictures already in Monday's events Reel
    are left out (owner, 2026-11-23), and so are the logo and icons."""
    sent = datetime.fromisoformat(issue['published_at'].replace('Z', '+00:00')).date()
    shown = events_reel_pictures(sent - timedelta(days=sent.weekday()))
    frames, seen = [newsletter_card(issue)], set()
    for src in re.findall(r'<img[^>]+src="([^"]+)"', issue['body']):
        key = _pic_key(src)
        if key in seen or key in shown or 'logo' in src.lower() or src.lower().endswith('.svg'):
            continue
        seen.add(key)
        try:
            frames.append(frame_jpeg(html.unescape(src)))
        except Exception as err:
            print(f'skip picture {src[:60]}: {err}')
        if len(frames) == MAX_SLIDES:
            break
    return frames


def frame_jpeg(img_url):
    """The event picture as a 1080x1920 JPEG frame: shown whole over a blurred, dimmed copy of itself
    (banners and flyers often carry words, so nothing is cropped); logos (#contain) sit smaller on white."""
    contain = img_url.endswith('#contain')
    r = requests.get(img_url.split('#')[0], timeout=30, headers={'User-Agent': 'SophiaCommons/1.0'})
    r.raise_for_status()
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(r.content))).convert('RGB')
    if contain:
        out = Image.new('RGB', (W, H), 'white')
        im = ImageOps.contain(im, (int(W * 0.7), int(W * 0.7)), Image.LANCZOS)
    else:
        out = ImageOps.fit(im, (W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(40))
        out = Image.blend(out, Image.new('RGB', (W, H), 'black'), 0.35)
        im = ImageOps.contain(im, (W, H), Image.LANCZOS)
    out.paste(im, ((W - im.width) // 2, (H - im.height) // 2))
    buf = io.BytesIO()
    out.save(buf, 'JPEG', quality=90)
    return buf.getvalue()


def centered(draw, y, text, font, color):
    """Draws text centered on the frame. The site's display font has no period, so each '.' is drawn
    in Pillow's built-in font at the same size (sophiacommons.org would otherwise show a box)."""
    dot = ImageFont.load_default(size=font.size)
    if 'Anthro' in str(getattr(font, 'path', '')):      # the Anthro typeface has its own period
        dot, text = font, text
    parts = [(p, font) for p in text.split('.')]
    runs = []
    for i, (p, f) in enumerate(parts):
        if i:
            runs.append(('.', dot))
        runs.append((p, f))
    x = (W - sum(draw.textlength(t, font=f) for t, f in runs)) / 2
    base = y + font.getmetrics()[0]          # one shared baseline for both fonts
    for t, f in runs:
        draw.text((x, base), t, font=f, fill=color, anchor='ls')
        x += draw.textlength(t, font=f)


def end_card():
    """Owner rule 2026-11-23: every Reel ends on the website's own logo (the blue mark, from the app's
    splash icon) and sophiacommons.org, in the site's header font (Sophia Commons Display) and colors."""
    out = Image.new('RGB', (W, H), '#FDFBF7')                       # --bg
    mark = Image.open(os.path.join(ASSETS, 'logo-mark.png')).convert('RGBA')
    mh = 500
    mark = mark.resize((round(mark.width * mh / mark.height), mh), Image.LANCZOS)
    out.paste(mark, ((W - mark.width) // 2, 470), mark)
    draw = ImageDraw.Draw(out)
    font = os.path.join(ASSETS, 'SophiaCommonsDisplay.ttf')
    # Tagline (owner, 2026-11-23), in two lines so it fits the frame
    for text, size, color, y in [('Sophia Commons', 118, '#1E1810', 1060),        # --text-primary
                                 ('sophiacommons.org', 66, '#7F6116', 1230),      # --gold-text
                                 ('Uniting the world of anthroposophy', 46, '#5A4E42', 1360),  # --text-secondary
                                 ('and the Christian community', 46, '#5A4E42', 1425)]:
        centered(draw, y, text, ImageFont.truetype(font, size), color)
    buf = io.BytesIO()
    out.save(buf, 'JPEG', quality=92)
    return buf.getvalue()


MUSIC_GAP = timedelta(days=7)   # owner, 2026-11-23: never the same track twice in one week


def recent_tracks():
    """Tracks of the Reels posted (or being posted) in the last 7 days, newest first; [] if none or unreadable."""
    try:
        url, H = supabase()
        since = (datetime.now(timezone.utc) - MUSIC_GAP).isoformat()
        rows = requests.get(url + '/rest/v1/instagram_posts', headers=H, timeout=30, params={
            'select': 'music', 'status': 'in.(posted,posting)', 'music': 'not.is.null',
            'drafted_at': f'gte.{since}', 'order': 'drafted_at.desc'}).json()
        return [r['music'] for r in rows] if isinstance(rows, list) else []
    except Exception:
        return []


def next_track(tracks, recent):
    """Owner rules 2026-11-23: the music rotates, and no track is used twice within a week.
    Takes the next track after the newest one used (by file name, wrapping around) that has not been used
    in the last 7 days; if every track has, the one used longest ago."""
    names = [os.path.basename(t) for t in tracks]
    if not recent:
        return tracks[0]
    start = next((i for i, n in enumerate(names) if n > recent[0]), 0)
    order = names[start:] + names[:start]
    fresh = [n for n in order if n not in recent]
    pick = fresh[0] if fresh else max(order, key=lambda n: recent.index(n) if n in recent else len(recent))
    return tracks[names.index(pick)]


def pick_music():
    """The next track from automation/ig_music/ (mp3 or m4a), sorted by file name."""
    tracks = sorted(glob.glob(os.path.join(MUSIC, '*.mp3')) + glob.glob(os.path.join(MUSIC, '*.m4a')))
    if not tracks:
        sys.exit(f'No music in {MUSIC}: add at least one royalty-free mp3; nothing posted.')
    return next_track(tracks, recent_tracks())


def build_reel(frames, music, out_path):
    """Slideshow with cross-fades, music faded in and out, H.264 + AAC as Instagram asks."""
    n = len(frames)
    dur = n * SLIDE_S - (n - 1) * FADE_S
    with tempfile.TemporaryDirectory() as tmp:
        args = ['ffmpeg', '-y', '-loglevel', 'error']
        for i, data in enumerate(frames):
            path = os.path.join(tmp, f'{i}.jpg')
            open(path, 'wb').write(data)
            args += ['-loop', '1', '-framerate', '30', '-t', str(SLIDE_S), '-i', path]
        args += ['-stream_loop', '-1', '-i', music]
        chain, last = [], '[0:v]'
        for i in range(1, n):
            chain.append(f'{last}[{i}:v]xfade=transition=fade:duration={FADE_S}:offset={i * (SLIDE_S - FADE_S)}[v{i}]')
            last = f'[v{i}]'
        chain.append(f'{last}format=yuv420p[v]')
        # loudnorm: every track plays at about the same level as other social video
        chain.append(f'[{n}:a]loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=1,afade=t=out:st={dur - 2}:d=2[a]')
        args += ['-filter_complex', ';'.join(chain), '-map', '[v]', '-map', '[a]', '-t', str(dur),
                 '-c:v', 'libx264', '-profile:v', 'high', '-r', '30', '-crf', '21', '-movflags', '+faststart',
                 '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', out_path]
        subprocess.run(args, check=True)
    return dur


def slides(evs):
    """Up to 10 (event, jpeg bytes) pairs; a picture that cannot be read is skipped."""
    picks, seen = [], set()
    for e in evs:
        src = e.get('image_url')
        if not src or src in seen:          # events in one series share a picture
            continue
        seen.add(src)
        try:
            picks.append((e, frame_jpeg(src)))
        except Exception as err:
            print(f'skip picture for {e["id"][:8]}: {err}')
        if len(picks) == MAX_SLIDES:
            break
    return picks


def upload(folder, path):
    """The reel to the public social bucket (event-images only takes pictures)."""
    url, H = supabase()
    key = f'social/instagram/{folder}/reel.mp4'
    r = requests.post(f'{url}/storage/v1/object/{key}', data=open(path, 'rb').read(), timeout=120,
                      headers={**H, 'Content-Type': 'video/mp4', 'x-upsert': 'true', 'Cache-Control': '86400'})
    r.raise_for_status()
    return f'{url}/storage/v1/object/public/{key}'


def graph(method, path, **params):
    params['access_token'] = os.environ['IG_ACCESS_TOKEN']
    r = requests.request(method, f'{GRAPH}/{path}', params=params, timeout=60)
    body = r.json() if r.content else {}
    if not r.ok or 'error' in body:
        raise RuntimeError(f"Instagram API {path}: {body.get('error', {}).get('message') or r.status_code}")
    return body


def wait_ready(container_id):
    for _ in range(60):
        status = graph('GET', container_id, fields='status_code').get('status_code')
        if status == 'FINISHED':
            return
        if status in ('ERROR', 'EXPIRED'):
            raise RuntimeError(f'Instagram could not process media {container_id}: {status}')
        time.sleep(5)
    raise RuntimeError(f'Instagram media {container_id} not ready after 5 minutes')


def publish(video_url, text):
    """Posts the Reel (also shown in the main feed); returns its permalink."""
    ig = os.environ['IG_USER_ID']
    creation = graph('POST', f'{ig}/media', media_type='REELS', video_url=video_url, caption=text, share_to_feed='true')['id']
    wait_ready(creation)
    media_id = graph('POST', f'{ig}/media_publish', creation_id=creation)['id']
    return graph('GET', media_id, fields='permalink').get('permalink') or 'https://www.instagram.com/'


def get_row(post_id):
    url, H = supabase()
    rows = requests.get(url + '/rest/v1/instagram_posts', headers=H, timeout=30,
                        params={'select': 'status,posted_url', 'id': 'eq.' + post_id}).json()
    if not isinstance(rows, list):
        sys.exit(f'Could not read instagram_posts (has the 2026-11-23 migration been run?): {rows}')
    return rows[0] if rows else None


def save_row(row):
    url, H = supabase()
    r = requests.post(url + '/rest/v1/instagram_posts', json=row, timeout=30,
                      headers={**H, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal'})
    if r.status_code >= 300:
        print(f'(instagram_posts not updated: HTTP {r.status_code} {r.text[:200]})')


def claim_check(post_id):
    """Stops when this post already went out or a run is stuck midway; needs the Instagram secrets."""
    for k in ('IG_USER_ID', 'IG_ACCESS_TOKEN'):
        if not os.environ.get(k):
            sys.exit(f'{k} is not set; nothing posted.')
    row = get_row(post_id)
    if row and row['status'] == 'posted':
        print('Already posted: ' + str(row.get('posted_url'))); sys.exit(0)
    if row and row['status'] == 'posting':
        sys.exit(f'{post_id} is marked "posting" (a run is in progress or stopped midway). Check Instagram, '
                 'then set the row to failed in instagram_posts to retry.')


def ship(cmd, row, frames, text, folder):
    """Builds the Reel (pictures, end card, next music track); previews it or posts it once."""
    music = pick_music()
    os.makedirs(PREVIEW, exist_ok=True)
    reel = os.path.join(PREVIEW, 'reel.mp4')
    dur = build_reel(frames + [end_card()], music, reel)
    if cmd == 'preview':
        open(os.path.join(PREVIEW, 'caption.txt'), 'w').write(text)
        print(text + f'\n\n{len(text)} characters. {len(frames)} pictures, {dur:.0f} s, music: '
              f'{os.path.basename(music)}. Saved {reel}. Nothing was posted.')
        return
    row = {**row, 'caption': text, 'music': os.path.basename(music), 'status': 'posting', 'error': None,
           'drafted_at': datetime.now(timezone.utc).isoformat()}
    save_row(row)
    try:
        row['video_url'] = upload(folder, reel)
        link = publish(row['video_url'], text)
    except Exception as err:
        save_row({**row, 'status': 'failed', 'error': str(err)[:500]})
        sys.exit(f'Instagram post failed: {err}')
    save_row({**row, 'status': 'posted', 'posted_url': link, 'posted_at': datetime.now(timezone.utc).isoformat()})
    print(f'Posted the Reel ({len(frames)} pictures, {os.path.basename(music)}): {link}')


def run_events(cmd, monday):
    post_id = f'events-{monday}'
    if cmd == 'post':
        claim_check(post_id)
    evs = week_events(monday)
    if not evs:
        print(f'No events for the week of {monday}; nothing posted.'); return
    picks = slides(evs)
    if not picks:
        print(f'None of the {len(evs)} events this week has a usable picture; nothing posted.'); return
    row = {'id': post_id, 'kind': 'events', 'title': f'Events, week of {monday} ({len(evs)} events)',
           'event_ids': [e['id'] for e, _ in picks]}
    ship(cmd, row, [data for _, data in picks], caption(evs), str(monday))


def run_newsletter(cmd):
    """The newest sent weekly issue, once (owner, 2026-11-23: the newsletter also goes to Instagram)."""
    issue = latest_issue()
    sent = datetime.fromisoformat(issue['published_at'].replace('Z', '+00:00'))
    if cmd == 'post' and datetime.now(timezone.utc) - sent > NEWSLETTER_MAX_AGE:
        print(f'The newest issue was sent {sent:%b %-d}; this week\'s is not out yet. Nothing posted.'); return
    post_id = f"newsletter-{issue['id']}"
    if cmd == 'post':
        claim_check(post_id)
    frames = newsletter_slides(issue)
    if len(frames) < 2:
        print('The issue has no pictures that were not already in the events Reel; nothing posted.'); return
    row = {'id': post_id, 'kind': 'newsletter', 'title': clean(issue['title'])}
    ship(cmd, row, frames, newsletter_caption(issue), post_id)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['preview', 'post'])
    ap.add_argument('--next', action='store_true', help='events: next week instead of this week')
    ap.add_argument('--newsletter', action='store_true', help='the newest sent weekly newsletter instead of the events')
    ap.add_argument('--festival', action='store_true', help='a festival 1 to 3 days ahead (preview: the next one)')
    ap.add_argument('--new', action='store_true', help="the week's new directory listings")
    ap.add_argument('--daily', action='store_true', help='a Reel only if none went out today (Pacific time)')
    ap.add_argument('--as', dest='as_kind', choices=['spotlight', 'weekend', 'exercise'], help='daily: which kind (preview)')
    a = ap.parse_args()
    load_env()
    if a.newsletter:
        run_newsletter(a.cmd); return
    if a.daily:   # owner, 2026-11-25: at least one Reel every day (automation/ig_daily_reels.py)
        import ig_daily_reels
        ig_daily_reels.run_daily(a.cmd, a.as_kind); return
    if a.festival or a.new:   # owner, 2026-11-23: festival and new-listings Reels (automation/ig_more_reels.py)
        import ig_more_reels
        (ig_more_reels.run_festival if a.festival else ig_more_reels.run_new)(a.cmd); return
    today = datetime.now(timezone.utc).date()
    monday = today - timedelta(days=today.weekday()) + (timedelta(days=7) if a.next else timedelta())
    run_events(a.cmd, monday)


if __name__ == '__main__':
    main()
