#!/usr/bin/env python3
"""
The weekly newsletter as an X post (owner, 2026-11-18).

Once the weekly issue is sent it is published and lives in the Blog at /article/<id>. This script turns it
into a short X post: one or two plain sentences (written by Claude from the issue, or the issue's excerpt
when no key is set), up to three hashtags picked from a fixed list by what the issue is about, and the
Blog link. It never posts by itself: `post` needs --approved, which is given only after the owner approves
the exact text ("post it").

  python3 automation/x_post.py draft                 # newest sent issue -> automation/x_drafts/<id>.json
  python3 automation/x_post.py draft --text "..."    # replace the sentences (hashtags and link are added)
  python3 automation/x_post.py events                # Monday post: this week's events + /events link
  python3 automation/x_post.py events --text "..."   # replace the sentences
  python3 automation/x_post.py show                  # print the current draft and its length
  python3 automation/x_post.py post --approved       # post via Composio, then fill the home page X card
                                                     # (X_LATEST_POST in sophia_commons_v9.js; deploy after)
Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY), ANTHROPIC_API_KEY (optional).
"""
import argparse
import html
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DRAFTS = os.path.join(HERE, 'x_drafts')
JS = os.path.join(ROOT, 'sophia_commons_v9.js')
SITE = 'https://sophiacommons.org'
HANDLE = 'SophiaCommons7'
MODEL = os.environ.get('X_POST_MODEL', 'claude-haiku-5-5')
LIMIT = 280            # X counts every link as 23 characters
LINK_LEN = 23
SENTENCE_MAX = 190
# Hashtags: always the first, then up to two of the rest, the ones the issue mentions most (owner, 2026-11-18)
BASE_TAG = '#Anthroposophy'
TAGS = [
    ('#WaldorfEducation', r'\bwaldorf|steiner school'),
    ('#Biodynamic', r'biodynamic'),
    ('#Camphill', r'camphill'),
    ('#RudolfSteiner', r'rudolf steiner'),
    ('#Eurythmy', r'eurythm'),
    ('#Advent', r'\badvent\b|holy nights'),
    ('#ChristianCommunity', r'christian community|christengemeinschaft'),
    ('#AnthroposophicMedicine', r'anthroposophic medicine|mistletoe'),
]


def load_env():
    for p in (os.path.join(ROOT, '.env'), os.path.join(ROOT, '..', '.env')):
        if os.path.exists(p):
            for line in open(p):
                if '=' in line and not line.lstrip().startswith('#'):
                    k, v = line.strip().split('=', 1)
                    os.environ.setdefault(k, v.strip('"\''))


def supabase():
    url = os.environ['SUPABASE_URL']
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_SERVICE_KEY']
    return url, {'apikey': key, 'Authorization': 'Bearer ' + key}


def latest_issue(news_id=None):
    url, H = supabase()
    params = {'select': 'id,title,excerpt,body,published_at', 'tags': 'cs.{weekly-digest}', 'status': 'eq.published',
              'order': 'published_at.desc', 'limit': '1'}
    if news_id:
        params['id'] = 'eq.' + news_id
    rows = requests.get(url + '/rest/v1/news', headers=H, params=params, timeout=30).json()
    if not rows:
        sys.exit('No sent weekly issue found (it must be sent and published first).')
    return rows[0]


def plain(s):
    t = re.sub(r'(?is)<(script|style)\b.*?</\1>', ' ', s or '')
    t = html.unescape(re.sub(r'<[^>]+>', ' ', t))
    return re.sub(r'\s+', ' ', t).strip()


def clean(s):
    """Plain keyboard characters only (owner's rule): no dashes, curly quotes or emoji."""
    s = s.replace('—', ', ').replace('–', '-').replace('‘', "'").replace('’', "'")
    s = s.replace('“', '"').replace('”', '"').replace('…', '...')
    s = ''.join(ch for ch in s if ord(ch) < 0x2000 or ch in 'äöüÄÖÜßéèàç')
    return re.sub(r'\s+', ' ', s).strip()


def pick_tags(text):
    low = text.lower()
    hits = sorted(((len(re.findall(rx, low)), tag) for tag, rx in TAGS), reverse=True)
    return [BASE_TAG] + [tag for n, tag in hits if n > 0][:2]


def sentences(issue):
    key = os.environ.get('ANTHROPIC_API_KEY')
    fallback = clean(issue.get('excerpt') or issue['title'])
    if not key:
        return fallback
    prompt = (f"This is this week's Sophia Commons newsletter, a free directory of the anthroposophical community. "
              f"Write the text of a post for X about it: one or two short, warm, plain sentences, at most {SENTENCE_MAX} "
              f"characters, naming two or three concrete things in this issue. No hashtags, no links, no emoji, no em or "
              f"en dashes, no exclamation marks, no 'delve' or similar filler. Return only the post text.\n\n"
              f"TITLE: {issue['title']}\nSUMMARY: {issue.get('excerpt') or ''}\n\nISSUE TEXT:\n{plain(issue['body'])[:12000]}")
    try:
        r = requests.post('https://api.anthropic.com/v1/messages', timeout=90,
                          headers={'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
                          json={'model': MODEL, 'max_tokens': 300, 'messages': [{'role': 'user', 'content': prompt}]})
        r.raise_for_status()
        out = clean(''.join(b.get('text', '') for b in r.json().get('content', []) if b.get('type') == 'text')).strip('"')
        return out if 20 <= len(out) <= SENTENCE_MAX + 40 else fallback
    except (requests.RequestException, ValueError) as e:
        print(f'Claude unavailable ({e}); using the issue summary.')
        return fallback


def compose(text, tags, link):
    body = f'{text}\n\n{" ".join(tags)}\n{link}'
    length = len(body) - len(link) + LINK_LEN
    return body, length


def draft_path(news_id):
    return os.path.join(DRAFTS, news_id + '.json')


def newest_draft():
    files = sorted((os.path.join(DRAFTS, f) for f in os.listdir(DRAFTS) if f.endswith('.json')), key=os.path.getmtime) \
        if os.path.isdir(DRAFTS) else []
    if not files:
        sys.exit('No draft yet. Run: python3 automation/x_post.py draft')
    return json.load(open(files[-1]))


def save(d):
    os.makedirs(DRAFTS, exist_ok=True)
    json.dump(d, open(draft_path(d['news_id']), 'w'), indent=2, ensure_ascii=False)


def show(d):
    print('\n' + d['post'] + '\n')
    print(f"{d['length']} of {LIMIT} characters (the link counts as {LINK_LEN}). Issue: {d['title']}")
    if d.get('posted_url'):
        print('Posted: ' + d['posted_url'])


def cmd_draft(a):
    issue = latest_issue(a.id)
    text = clean(a.text) if a.text else sentences(issue)
    tags = pick_tags(issue['title'] + ' ' + (issue.get('excerpt') or '') + ' ' + plain(issue['body']))
    link = f"{SITE}/article/{issue['id']}"
    post, length = compose(text, tags, link)
    while length > LIMIT and len(tags) > 1:      # too long: drop hashtags from the end, never the link
        tags = tags[:-1]
        post, length = compose(text, tags, link)
    if length > LIMIT:
        sys.exit(f'Too long ({length}); shorten it with --text.')
    d = {'news_id': issue['id'], 'title': issue['title'], 'text': text, 'tags': tags, 'link': link,
         'post': post, 'length': length, 'drafted_at': datetime.now(timezone.utc).isoformat()}
    if a.preview:
        show(d)
        print('Preview only: no draft saved, nothing posted.')
        return
    save(d)
    show(d)
    print('Nothing was posted. It goes out only after the owner approves this exact text.')


EVENTS_TAG = '#AnthroposophyEvents'
TITLE_MAX = 70


def week_events(monday):
    """Public events that start Monday to Sunday of the given week (UTC days)."""
    url, H = supabase()
    end = monday + timedelta(days=7)
    rows = requests.get(url + '/rest/v1/events', headers=H, timeout=30, params={
        'select': 'id,title,title_en,description,description_en,is_online,city,country,featured,start_date',
        'status': 'in.(upcoming,ongoing)', 'and': f'(start_date.gte.{monday:%Y-%m-%d},start_date.lt.{end:%Y-%m-%d})',
        'order': 'featured.desc,start_date.asc', 'limit': '500'}).json()
    if not isinstance(rows, list):
        sys.exit(f'Could not read events: {rows}')
    return rows


def short_title(e):
    t = clean(e.get('title_en') or e['title'])
    t = re.split(r'\s*[|(]\s*', t)[0].strip(' :-')
    return t if len(t) <= TITLE_MAX else ''


def events_text(evs, n=2):
    """Two plain sentences from the week's calendar: the count, how many online, and two named events."""
    online = sum(1 for e in evs if e.get('is_online'))
    places = sorted({e['city'] for e in evs if e.get('city') and not e.get('is_online')})
    picks, seen = [], set()
    for e in evs:
        t = short_title(e)
        if t and t.lower() not in seen:
            seen.add(t.lower())
            picks.append(t + (' (online)' if e.get('is_online') else f" in {e['city']}" if e.get('city') else ''))
        if len(picks) >= n:
            break
    first = f'{len(evs)} anthroposophical events this week on the Sophia Commons calendar'
    first += f', {online} of them online.' if online else '.'
    if picks:
        second = 'Among them: ' + ' and '.join(picks) + '.'
    elif places and n:
        second = 'In ' + ', '.join(places[:3]) + ' and more.'
    else:
        second = ''
    return clean(f'{first} {second}'.strip())


def cmd_events(a):
    today = datetime.now(timezone.utc).date()
    monday = today - timedelta(days=today.weekday()) if not a.next else today + timedelta(days=7 - today.weekday())
    evs = week_events(monday)
    if not evs:
        sys.exit(f'No events on the calendar for the week of {monday}; nothing drafted.')
    blob = ' '.join((e.get('title_en') or e['title']) + ' ' + (e.get('description_en') or e.get('description') or '') for e in evs)
    tags = pick_tags(blob)[:2] + [EVENTS_TAG]
    link = f'{SITE}/events'
    # Too long: name fewer events first, keep the hashtags; the link always stays
    for n in ((None,) if a.text else (2, 1, 0)):
        text = clean(a.text) if a.text else events_text(evs, n)
        post, length = compose(text, tags, link)
        if length <= LIMIT:
            break
    if length > LIMIT:
        sys.exit(f'Too long ({length}); shorten it with --text.')
    d = {'news_id': f'events-{monday}', 'title': f'Events, week of {monday} ({len(evs)} events)', 'text': text,
         'tags': tags, 'link': link, 'post': post, 'length': length, 'drafted_at': datetime.now(timezone.utc).isoformat()}
    if a.preview:
        show(d)
        print('Preview only: no draft saved, nothing posted.')
        return
    if os.path.exists(draft_path(d['news_id'])) and json.load(open(draft_path(d['news_id']))).get('posted_url'):
        sys.exit('This week\'s events post already went out.')
    save(d)
    show(d)
    print('Nothing was posted. It goes out only after the owner approves this exact text.')


def tweet_id(obj):
    if isinstance(obj, dict):
        if re.fullmatch(r'\d{6,25}', str(obj.get('id', ''))):
            return str(obj['id'])
        for v in obj.values():
            found = tweet_id(v)
            if found:
                return found
    if isinstance(obj, list):
        for v in obj:
            found = tweet_id(v)
            if found:
                return found
    return None


def fill_card(d):
    """Put the post into the home page X card (X_LATEST_POST); the site shows it after the next deploy."""
    card = {'url': d['posted_url'], 'text': d['text'], 'date': d['posted_at'][:10]}
    src = open(JS).read()
    new, n = re.subn(r'^var X_LATEST_POST = .*;$', 'var X_LATEST_POST = ' + json.dumps(card, ensure_ascii=False) + ';',
                     src, count=1, flags=re.M)
    if n != 1:
        sys.exit('Could not find X_LATEST_POST in sophia_commons_v9.js; the post went out, fill the card by hand.')
    open(JS, 'w').write(new)


def cmd_post(a):
    if not a.approved:
        sys.exit('Refusing to post: add --approved only after the owner approves this exact text.')
    d = json.load(open(draft_path(a.id))) if a.id else newest_draft()
    if d.get('posted_url'):
        sys.exit('Already posted: ' + d['posted_url'])
    show(d)
    r = subprocess.run(['composio', 'execute', 'TWITTER_CREATION_OF_A_POST', '-d', json.dumps({'text': d['post']})],
                       capture_output=True, text=True, timeout=120)
    out = r.stdout.strip()
    try:
        tid = tweet_id(json.loads(out[out.find('{'):]))
    except ValueError:
        tid = None
    if r.returncode != 0 or not tid:
        sys.exit(f'Post failed or no post id came back:\n{out[-800:]}\n{r.stderr[-400:]}')
    d['posted_url'] = f'https://x.com/{HANDLE}/status/{tid}'
    d['posted_at'] = datetime.now(timezone.utc).isoformat()
    save(d)
    fill_card(d)
    print('Posted: ' + d['posted_url'])
    print('The home page X card is filled in sophia_commons_v9.js: deploy a preview, then go live.')


def main():
    load_env()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('draft'); p.add_argument('--id'); p.add_argument('--text')
    p.add_argument('--preview', action='store_true', help='print the draft without saving it')
    p = sub.add_parser('events'); p.add_argument('--text'); p.add_argument('--preview', action='store_true')
    p.add_argument('--next', action='store_true', help="next week's Monday instead of this week")
    sub.add_parser('show')
    p = sub.add_parser('post'); p.add_argument('--id'); p.add_argument('--approved', action='store_true')
    a = ap.parse_args()
    if a.cmd == 'draft':
        cmd_draft(a)
    elif a.cmd == 'events':
        cmd_events(a)
    elif a.cmd == 'show':
        show(newest_draft())
    else:
        cmd_post(a)


if __name__ == '__main__':
    main()
