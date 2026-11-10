#!/usr/bin/env python3
"""
Events from organizations' own event feeds (owner, 2026-10-30).

Reads each source in automation/event_feeds.json (the WordPress "The Events Calendar" REST API, or a public
iCal feed when the source has an "ical" URL, e.g. a Google Calendar) and
adds the next year of events to the calendar. Rules:
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
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import requests

ROOT = os.path.dirname(os.path.abspath(__file__))
UA = {'User-Agent': 'Mozilla/5.0 (compatible; SophiaCommonsBot/1.0; +https://sophiacommons.org)'}
ADMIN_EMAILS = ['cameron.nazeri@gmail.com', 'cameron@sophiacommons.org', 'admin@sophiacommons.org']
DAYS_AHEAD = 365   # a full year (owner, 2026-10-31: far-off workshops were missing)
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


def zone_name(z) -> str | None:
    """A valid IANA zone name from a string or tzinfo (ZoneInfo, pytz, dateutil), else None."""
    name = z if isinstance(z, str) else (getattr(z, 'key', None) or getattr(z, 'zone', None)) if z else None
    if not name or '/' not in name:
        return None
    try:
        ZoneInfo(name)
        return name
    except (ZoneInfoNotFoundError, ValueError):
        return None


def event_type(title, cats):
    text = (title + ' ' + ' '.join(cats)).lower()
    return next((t for t, pat in TYPE_WORDS if re.search(pat, text)), 'other')


def read_ical(src, until):
    """Events from a public iCal feed (e.g. a Google Calendar), shaped like the WordPress API's events.
    Repeating events are expanded to their dates. An optional "include" regex on the source keeps only
    matching titles (a school calendar also holds internal days)."""
    import icalendar
    import recurring_ical_events
    r = requests.get(src['ical'], headers=UA, timeout=30)
    r.raise_for_status()
    cal = icalendar.Calendar.from_ical(r.content)
    keep = re.compile(src['include'], re.I) if src.get('include') else None
    # Times with no zone ("floating") are in the calendar's own zone, not UTC (2026-11-10)
    cal_zone = zone_name(str(cal.get('X-WR-TIMEZONE') or '')) or zone_name(src.get('timezone'))
    floating = ZoneInfo(cal_zone) if cal_zone else timezone.utc
    out = []
    for e in recurring_ical_events.of(cal).between(datetime.now(timezone.utc), until):
        title = str(e.get('SUMMARY') or '').strip()
        if not title or (keep and not keep.search(title)) or str(e.get('CLASS') or '').upper() == 'PRIVATE':
            continue
        start, end = e['DTSTART'].dt, (e['DTEND'].dt if e.get('DTEND') else None)
        all_day = not isinstance(start, datetime)
        utc = lambda d: (datetime(d.year, d.month, d.day, tzinfo=timezone.utc) if not isinstance(d, datetime)
                         else (d if d.tzinfo else d.replace(tzinfo=floating)).astimezone(timezone.utc))
        ev_zone = None if all_day else (zone_name(start.tzinfo) or cal_zone)
        fmt = lambda d: utc(d).strftime('%Y-%m-%d %H:%M:%S') if d else None
        if all_day and end:
            end = end - timedelta(days=1)   # iCal all-day end dates are exclusive
        out.append({'id': f"{e.get('UID')}@{utc(start):%Y%m%d}", 'title': html.escape(title),
                    'description': html.escape(str(e.get('DESCRIPTION') or '')), 'all_day': all_day,
                    'utc_start_date': fmt(start), 'utc_end_date': fmt(end), 'timezone': ev_zone,
                    'venue': {'venue': str(e.get('LOCATION') or '')}, 'url': str(e.get('URL') or src['base'])})
    return out


def read_feed(src, until):
    """All events from now until `until` (follows the API's pages)."""
    if src.get('ical'):
        return read_ical(src, until)
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
        'timezone': None if all_day else (zone_name(ev.get('timezone')) or zone_name(src.get('timezone'))),
        'location_name': (plain(venue.get('venue')) or None) if not online else (plain(venue.get('venue')) or 'Online'),
        'address': plain(venue.get('address')) or None, 'city': plain(venue.get('city')) or src.get('city'),
        'region': plain(venue.get('stateprovince') or venue.get('province') or venue.get('state')) or src.get('region'),
        'country': ('USA' if plain(venue.get('country')) in ('United States', 'US') else 'UK' if plain(venue.get('country')) in ('United Kingdom', 'GB') else plain(venue.get('country'))) or src.get('country'),
        'is_online': online, 'organizer_name': src['name'], 'organizer_url': src['base'],
        'ticket_url': ev.get('url') if (ev.get('url') or '').startswith('http') else None,
        'image_url': img if img and img.startswith('https://') else None,
        'is_free': bool(re.search(r'\bfree\b', cost, re.I)),
        'status': 'upcoming', 'source_event_id': f"{'ical' if src.get('ical') else 'tribe'}:{src['base'].split('//')[1].strip('/')}:{ev['id']}",
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
        except (requests.RequestException, ValueError, ImportError) as e:
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
