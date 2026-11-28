#!/usr/bin/env python3
"""
Events from organizations' event pages that have no feed (owner, 2026-11-18).

Once a week (Mondays, or any day with --force) each page in automation/event_pages.json is fetched, and Claude
lists the upcoming public events on it, the same way events_from_inbox.py reads newsletters. New ones are added
as PENDING: they appear in Admin > Events for the owner to approve and never go live by themselves. Events
already on the calendar (same title on the same day, or a close match) are skipped.

Usage: python3 automation/events_from_pages.py --dry-run --force   (prints what it finds, writes nothing)
       python3 automation/events_from_pages.py                     (daily workflow; does nothing except on Mondays)
Env:   ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY).
"""
import hashlib
import html
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import requests

from events_from_feeds import load_env
from events_from_inbox import MAX_TEXT, already_listed, ask_claude, show, supabase, to_row

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE_TEXT = 40000   # characters of an events page sent to Claude; long program pages (Schloss Hohenfels) run past the email limit
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'}
PROMPT = """This is the text of the events page of {name} ({page}), read on {today}. Links are shown as [text](url).

List every upcoming PUBLIC event on it that starts on or after {today}: talks, webinars, conferences, seminars,
courses, festivals. Use only facts written on the page; never guess a date, time or place. Leave out events before
{today}. If an event runs over several days, give one entry with the first day as the date and say the full dates in
the description. If no time is written, leave start_time empty. Unless the page says otherwise, times are in
{tz}. Use the event's own "information and registration" link when there is one. Keep titles in the page's language.
Plain characters only: no em or en dashes, no curly quotes. Return an empty list when there are no upcoming events.

PAGE TEXT:
{text}"""


def page_text(url):
    """The page as plain text, with links kept as [text](url) so Claude can give each event its own link."""
    r = requests.get(url, headers=UA, timeout=30)
    r.raise_for_status()
    t = re.sub(r'(?is)<(script|style|nav|header|footer)\b.*?</\1>', ' ', r.text)
    t = re.sub(r'(?is)<a\b[^>]*href="([^"#]+)"[^>]*>(.*?)</a>',
               lambda m: f' [{re.sub(r"<[^>]+>", " ", m.group(2)).strip()}]({m.group(1)}) ', t)
    t = html.unescape(re.sub(r'<[^>]+>', ' ', t))
    t = re.sub(r'\s+', ' ', t).strip()
    cut = t.find('Manage Consent')            # cookie banner text at the end of many WordPress pages
    return (t[:cut] if cut > 0 else t)[:PAGE_TEXT]


def events_on(src, key, owner):
    now = datetime.now(timezone.utc)
    prompt = PROMPT.format(name=src['name'], page=src['page'], today=now.strftime('%Y-%m-%d'),
                           tz=src.get('timezone', 'UTC'), text=page_text(src['page']))
    host = src['page'].split('//')[1].split('/')[0]
    rows = []
    for i, ev in enumerate(ask_claude(key, prompt)):
        r = to_row({**ev, 'organizer': ev.get('organizer') or src['name']}, owner, 'page', i)
        if not r:
            continue
        stable = hashlib.sha1(f"{r['title'].lower()}|{r['start_date'][:10]}".encode()).hexdigest()[:16]
        r['source_event_id'] = f'page:{host}:{stable}'
        r['organizer_name'] = src['name']
        r['directory_entry_id'] = src.get('directory_entry_id')
        r['timezone'] = ev.get('timezone') or src.get('timezone')
        # a source can give the country and language its page leaves out (Schloss Hohenfels, 2026-11-27)
        if not r.get('country') and src.get('country'):
            r['country'] = src['country']
        if src.get('lang'):
            r['lang'] = src['lang']
        rows.append(r)
    return rows


def main():
    load_env()
    if datetime.now(timezone.utc).weekday() != 0 and '--force' not in sys.argv:
        print('Event pages are read on Mondays (use --force to run now).')
        return
    key = os.environ.get('ANTHROPIC_API_KEY')
    if not key:
        print('ANTHROPIC_API_KEY not set: skipping event pages.')
        return
    dry = '--dry-run' in sys.argv
    sources = json.load(open(os.path.join(HERE, 'event_pages.json')))['sources']
    url, H, owner = supabase()
    now = datetime.now(timezone.utc)
    have = requests.get(url + '/rest/v1/events', headers=H, timeout=30, params={
        'select': 'title,start_date,source_event_id', 'start_date': 'gte.' + (now - timedelta(days=1)).isoformat()}).json()
    known = {e['source_event_id'] for e in have if e.get('source_event_id')}
    rows = []
    for src in sources:
        try:
            found = events_on(src, key, owner)
        except (RuntimeError, requests.RequestException, ValueError) as e:
            print(f"  skip {src['name']}: {e}")
            continue
        new = [r for r in found if r['source_event_id'] not in known and r['start_date'] >= now.isoformat()
               and not already_listed(r, have)]
        have += [{'title': r['title'], 'start_date': r['start_date']} for r in new]
        print(f"  {src['name']}: {len(found)} events, {len(new)} new")
        rows += new
    show(rows)
    if dry or not rows:
        print('Dry run: nothing written.' if dry else 'Nothing new.')
        return
    r = requests.post(url + '/rest/v1/events', headers={**H, 'Prefer': 'return=minimal'}, data=json.dumps(rows), timeout=30)
    if r.status_code >= 300:
        sys.exit(f'insert failed {r.status_code}: {r.text[:300]}')
    print(f'Added {len(rows)} pending events for review in Admin > Events.')


if __name__ == '__main__':
    main()
