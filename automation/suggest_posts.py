#!/usr/bin/env python3
"""
Suggested posts for Admin > Featured post (owner, 2026-10-29).

Facebook does not let other sites read its posts, so suggestions come from the news feeds that
organizations in the directory publish on their own websites (automation/post_sources.json).
For each source the newest posts from the last MAX_AGE_DAYS are added to suggested_posts with a
title, a short text and the article's picture (og:image, read with Scrapling's parser). An admin
features one with a click or dismisses it. Nothing reaches visitors without that click.

Usage: python3 automation/suggest_posts.py --dry-run     (prints, writes nothing)
       python3 automation/suggest_posts.py               (used by the daily workflow)
Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY); read from ../.env when not set.
"""
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import requests
from scrapling.parser import Selector

from news_roundup import JOB_TITLE, UA, clean, read_feed


def tidy(text, limit):
    """clean() plus straight quotes (house style)."""
    t = clean(text, limit)
    return t.translate(str.maketrans({'\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"'}))

ROOT = os.path.dirname(os.path.abspath(__file__))
MAX_AGE_DAYS = 21
PER_SOURCE = 2          # newest posts per source, so one busy feed does not fill the list
EXCERPT_LEN = 600
PAUSE = 1.0             # seconds between article pages


def load_env():
    path = os.path.join(ROOT, '..', '.env')
    if not os.path.exists(path):
        return
    for line in open(path):
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.strip().split('=', 1)
            os.environ.setdefault(k, v.strip('"\''))


def article_details(url):
    """og:image and og:description of the article page (empty strings when missing)."""
    try:
        r = requests.get(url, headers=UA, timeout=15)
        r.raise_for_status()
    except requests.RequestException:
        return '', ''
    page = Selector(r.text, url=r.url)

    def meta(prop):
        m = page.css(f'meta[property="{prop}"], meta[name="{prop}"]')
        return (m[0].attrib.get('content') or '').strip() if m else ''
    img = meta('og:image') or meta('twitter:image')
    return (img if img.startswith('https://') and len(img) <= 500 else ''), meta('og:description')


def candidates(sources):
    cut = datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)
    out = []
    for src in sources:
        try:
            items = read_feed({'feed': src['feed']})
        except Exception as e:      # one broken feed must not stop the rest
            print(f"  skip {src['name']}: {type(e).__name__}")
            continue
        items = [i for i in items if i['date'] and i['date'] > cut and (i['title'] or '').strip()
                 and (i['link'] or '').startswith('https://') and not JOB_TITLE.search(i['title'])]
        items.sort(key=lambda i: i['date'], reverse=True)
        out += [{**i, 'src': src} for i in items[:PER_SOURCE]]
    return out


def main():
    dry = '--dry-run' in sys.argv
    load_env()
    url = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_SERVICE_KEY']
    h = {'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}
    sources = json.load(open(os.path.join(ROOT, 'post_sources.json')))['sources']

    found = candidates(sources)
    known = set()
    if found:
        links = ','.join('"' + i['link'].replace('"', '') + '"' for i in found)
        for table in ('suggested_posts', 'featured_posts'):
            r = requests.get(f'{url}/rest/v1/{table}', headers=h, timeout=30, params={'select': 'url', 'url': f'in.({links})'})
            if r.status_code == 404 or 'does not exist' in r.text or 'Could not find the table' in r.text:
                if dry:
                    print(f'  ({table} not set up yet; previewing anyway)')
                    continue
                sys.exit(f'{table} is missing: run backend/migrations/RUN_THIS_2026-10-29_suggested_posts.sql first.')
            r.raise_for_status()
            known |= {x['url'] for x in r.json()}
    new = [i for i in found if i['link'] not in known]
    print(f'{len(found)} recent posts from {len(sources)} sources, {len(new)} new')

    rows = []
    for i in new:
        img, og_desc = article_details(i['link'])
        time.sleep(PAUSE)
        src = i['src']
        rows.append({'url': i['link'][:500], 'title': tidy(i['title'], 300), 'image_url': img or None,
                     'excerpt': tidy(i['summary'] or og_desc, EXCERPT_LEN) or None, 'source_name': src['name'][:200],
                     'entry_id': src.get('entry_id'), 'facebook_url': src.get('facebook_url'),
                     'published_at': i['date'].isoformat()})
        print(f"  {i['date']:%b %d}  {src['name'][:34]:34}  {rows[-1]['title'][:60]}{'  [picture]' if img else ''}")
    if dry or not rows:
        print('Dry run: nothing written.' if dry else 'Nothing new.')
        return
    r = requests.post(f'{url}/rest/v1/suggested_posts', headers={**h, 'Prefer': 'resolution=ignore-duplicates'},
                      params={'on_conflict': 'url'}, data=json.dumps(rows), timeout=30)
    r.raise_for_status()
    print(f'Added {len(rows)} suggestions.')


if __name__ == '__main__':
    main()
