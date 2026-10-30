#!/usr/bin/env python3
"""
Events from organizations' own event feeds (owner, 2026-10-30).

Reads the WordPress "The Events Calendar" REST API of each source in automation/event_feeds.json and
adds the next ~120 days of events to the calendar. Rules:
- an event already in the calendar (same feed id, or same title on the same day) is skipped;
- a repeating event (same title more than once in the window, e.g. a weekly produce stand or craft club)
  only gets its next date, so routine items do not flood the calendar;
- titles get plain punctuation (house style), descriptions are cut to 2,000 characters.

Usage: python3 automation/events_from_feeds.py --dry-run   (prints, writes nothing)
       python3 automation/events_from_feeds.py             (used by the daily workflow)
Env:   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY); read from ../.env when not set.
"""
import html
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import requests

ROOT = os.path.dirname(os.path.abspath(__file__))
UA = {'User-Agent': 'Mozilla/5.0 (compatible; SophiaCommonsBot/1.0; +https://sophiacommons.org)'}
ADMIN_EMAILS = ['cameron.nazeri@gmail.com', 'cameron@sophiacommons.org', 'admin@sophiacommons.org']
DAYS_AHEAD = 120
# Routine listings that are not events (a farm stand, weekly after-school clubs)
SKIP = re.compile(r'produce stand|farm stand|after.school|craft clubs?\b|office hours|closed\b', re.I)
TYPE_WORDS = [('conference', r'\bconference|symposium|congress\b'), ('festival', r"festival|fest\b|fair\b|bazaar|market|michaelmas|martinmas|lantern|advent|christmas|easter|st\.? john'?s (tide|day|festival)"),
              ('retreat', r'retreat'), ('study_group', r'study|reading group|lecture series|gospel|seminar'), ('workshop', r'workshop|class|course|training|painting|eurythmy|singing|choir')]


def load_env():
    path = os.path.join(ROOT, '..', '.env')
    if os.path.exists(path):
        for line in open(path):
            if '=' in line and not line.lstrip().startswith('#'):
                k, v = line.strip().split('=', 1)
                os.environ.setdefault(k, v.strip('"\''))


def plain(text, limit=None):
    """HTML to plain text with straight quotes and no long dashes."""
    t = html.unescape(re.sub(r'<br\s*/?>|</p>', '\n', text or '', flags=re.I))
    t = re.sub(r'<[^>]+>', ' ', t)
    t = t.translate(str.maketrans({'‘': "'", '’': "'", '“': '"', '”': '"', ' ': ' '}))
    t = re.sub(r'\s+[–—]\s+', ': ', t).replace('—', ', ').replace('–', '-')
    t = re.sub(r'[ \t]+', ' ', re.sub(r'\n\s*\n+', '\n\n', t)).strip()
    return t[:limit - 3].rsplit(' ', 1)[0] + '...' if limit and len(t) > limit else t


norm = lambda s: re.sub(r'[^a-z0-9]+', '', (s or '').lower())[:40]


def event_type(title, cats):
    text = (title + ' ' + ' '.join(cats)).lower()
    return next((t for t, pat in TYPE_WORDS if re.search(pat, text)), 'other')


def read_feed(src, until):
    """All events from now until `until` (follows the API's pages)."""
    out, page = [], 1
    while page <= 6:
        r = requests.get(src['base'].rstrip('/') + '/wp-json/tribe/events/v1/events', headers=UA, timeout=20,
                         params={'per_page': 50, 'page': page, 'start_date': 'now', 'end_date': until.strftime('%Y-%m-%d')})
        if r.status_code == 400 and page > 1:
            break
        r.raise_for_status()
        j = r.json()
        out += j.get('events', [])
        if page >= int(j.get('total_pages') or 1):
            break
        page += 1
    return out


def to_row(ev, src, owner):
    venue = ev.get('venue') if isinstance(ev.get('venue'), dict) else {}
    title = re.sub(r'^(\d+)\.(?=\S)', r'\1. ', plain(ev.get('title'), 200))   # "5.Spiritual" -> "5. Spiritual"
    online = bool(re.search(r'\b(online|zoom|virtual|webinar)\b', ' '.join([title, venue.get('venue', ''), venue.get('address', '')]), re.I))
    start = datetime.strptime(ev['utc_start_date'], '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
    end = datetime.strptime(ev['utc_end_date'], '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc) if ev.get('utc_end_date') else None
    all_day = bool(ev.get('all_day'))
    if all_day:   # all-day events are stored at 12:00 UTC so the date is right everywhere
        start = start.replace(hour=12, minute=0, second=0)
        end = end.replace(hour=12, minute=0, second=0) if end else None
    img = (ev.get('image') or {}).get('url') if isinstance(ev.get('image'), dict) else None
    cost = plain(ev.get('cost') or '')
    return {
        'user_id': owner, 'title': title,
        'description': re.sub(r'^[@\W]+(?=\w)', '', plain(ev.get('description'), 2000)) or f"{title}, with {src['name']}. Details and registration on the organizer's event page.",
        'event_type': event_type(title, [c.get('name', '') for c in ev.get('categories') or []]),
        'start_date': start.isoformat(), 'end_date': end.isoformat() if end and end > start else None, 'is_all_day': all_day,
        'location_name': (plain(venue.get('venue')) or None) if not online else (plain(venue.get('venue')) or 'Online'),
        'address': plain(venue.get('address')) or None, 'city': plain(venue.get('city')) or src.get('city'),
        'region': plain(venue.get('stateprovince') or venue.get('province') or venue.get('state')) or src.get('region'),
        'country': ('USA' if plain(venue.get('country')) in ('United States', 'US') else 'UK' if plain(venue.get('country')) in ('United Kingdom', 'GB') else plain(venue.get('country'))) or src.get('country'),
        'is_online': online, 'organizer_name': src['name'], 'organizer_url': src['base'],
        'ticket_url': ev.get('url') if (ev.get('url') or '').startswith('http') else None,
        'image_url': img if img and img.startswith('https://') else None,
        'is_free': bool(re.search(r'\bfree\b', cost, re.I)),
        'status': 'upcoming', 'source_event_id': f"tribe:{src['base'].split('//')[1].strip('/')}:{ev['id']}",
    }


def main():
    dry = '--dry-run' in sys.argv
    load_env()
    url = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_SERVICE_KEY']
    H = {'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}
    users = requests.get(url + '/auth/v1/admin/users', headers=H, params={'per_page': 200}, timeout=20).json().get('users', [])
    owner = next((u['id'] for u in users if (u.get('email') or '').lower() in ADMIN_EMAILS and u.get('email_confirmed_at')), None)
    if not owner:
        sys.exit('no confirmed admin account to own the events')

    now = datetime.now(timezone.utc)
    have = requests.get(url + '/rest/v1/events', headers=H, timeout=30, params={
        'select': 'title,start_date,source_event_id,organizer_name', 'start_date': 'gte.' + (now - timedelta(days=1)).isoformat()}).json()
    known_ids = {e['source_event_id'] for e in have if e.get('source_event_id')}
    known_day = {(norm(e['title']), e['start_date'][:10]) for e in have}
    known_series = {(norm(e['title']), e.get('organizer_name')) for e in have}

    rows = []
    for src in json.load(open(os.path.join(ROOT, 'event_feeds.json')))['sources']:
        try:
            evs = read_feed(src, now + timedelta(days=DAYS_AHEAD))
        except (requests.RequestException, ValueError) as e:
            print(f"  skip {src['name']}: {type(e).__name__}")
            continue
        evs.sort(key=lambda e: e.get('utc_start_date') or '')
        seen, added = set(), 0
        for ev in evs:
            if not ev.get('utc_start_date'):
                continue
            r = to_row(ev, src, owner)
            if SKIP.search(r['title']):
                continue
            k = norm(r['title'])
            # one date per repeating event: skip later dates, and skip while an earlier date is still upcoming
            if k in seen or (k, src['name']) in known_series:
                seen.add(k)
                continue
            seen.add(k)
            if r['source_event_id'] in known_ids or (k, r['start_date'][:10]) in known_day:
                continue
            rows.append(r)
            added += 1
        print(f"  {src['name']}: {len(evs)} in feed, {added} new")

    for r in rows:
        print(f"    {r['start_date'][:10]}  {r['event_type']:11} {r['title'][:70]}{'  [online]' if r['is_online'] else ''}{'  [picture]' if r['image_url'] else ''}")
    if dry or not rows:
        print('Dry run: nothing written.' if dry else 'Nothing new.')
        return
    r = requests.post(url + '/rest/v1/events', headers=H, data=json.dumps(rows), timeout=30)
    if not r.ok:
        sys.exit(f'insert failed: HTTP {r.status_code} {r.text[:300]}')
    print(f'Added {len(rows)} events.')


if __name__ == '__main__':
    main()
