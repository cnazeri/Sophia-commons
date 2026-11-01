#!/usr/bin/env python3
"""
Events from organizations' newsletters (owner, 2026-10-31).

The events inbox (a Gmail account that the groups' newsletters are sent or forwarded to) is read over IMAP.
For each unread email, Claude lists the upcoming public events it announces (title, date, time, time zone,
place, link). New ones are added as PENDING: they appear in Admin > Events for the owner to approve and never
go live by themselves. Events already on the calendar (same title on the same day) are skipped. Processed
emails are marked read, so each newsletter is looked at once.

Usage: python3 automation/events_from_inbox.py --dry-run         (reads the inbox, prints, writes nothing, leaves mail unread)
       python3 automation/events_from_inbox.py --test file.txt   (one saved email or text; prints the events found)
       python3 automation/events_from_inbox.py                   (daily workflow)
Env:   INBOX_USER, INBOX_APP_PASSWORD (Gmail app password; exits quietly without them), INBOX_HOST (default imap.gmail.com),
       ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY).
"""
import email
import hashlib
import imaplib
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from email.header import decode_header, make_header
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo

import requests

from events_from_feeds import ADMIN_EMAILS, event_type, load_env, norm, plain

MODEL = os.environ.get('INBOX_MODEL', 'claude-haiku-5-5')
MAX_TEXT = 15000      # characters of each email sent to Claude
MAX_MAILS = 40        # per run
SCHEMA = {
    'type': 'object', 'additionalProperties': False, 'required': ['events'],
    'properties': {'events': {'type': 'array', 'items': {
        'type': 'object', 'additionalProperties': False,
        'required': ['title', 'date', 'start_time', 'end_time', 'timezone', 'online', 'location_name', 'address', 'city',
                     'region', 'country', 'link', 'organizer', 'description', 'price'],
        'properties': {
            'title': {'type': 'string'}, 'date': {'type': 'string', 'description': 'YYYY-MM-DD'},
            'start_time': {'type': 'string', 'description': 'HH:MM 24h, or empty if not given'},
            'end_time': {'type': 'string', 'description': 'HH:MM 24h, or empty'},
            'timezone': {'type': 'string', 'description': 'IANA zone of the stated time, e.g. America/Los_Angeles'},
            'online': {'type': 'boolean'}, 'location_name': {'type': 'string'}, 'address': {'type': 'string'},
            'city': {'type': 'string'}, 'region': {'type': 'string'}, 'country': {'type': 'string'},
            'link': {'type': 'string', 'description': 'sign-up, Zoom or event page URL from the email, or empty'},
            'organizer': {'type': 'string'}, 'description': {'type': 'string', 'description': '1 to 4 sentences, facts from the email only'},
            'price': {'type': 'string', 'description': 'as stated, or empty'}}}}}}
PROMPT = """This email was sent on {sent} by {sender}, subject "{subject}". It is probably a newsletter from an
anthroposophical group (a branch, Waldorf school, biodynamic farm, Camphill, Christian Community, eurythmy, etc.).

List every upcoming PUBLIC event it announces that starts after {sent_day}: talks, study groups, festivals, workshops,
conferences, courses, concerts, open days. Use only facts written in the email; never guess a date, time or place.
Leave out: events before {sent_day}, regular service times that are not special events, fundraising appeals,
"no meeting" notices, and anything private. If an event repeats on several listed dates, give one entry per date.
If the year is not written, use the next occurrence after {sent_day}. Give times in the time zone the email means
(the group's own city), with its IANA name. Plain characters only: no em or en dashes, no curly quotes.
Return an empty list when the email announces no events.

EMAIL TEXT:
{text}"""


def ask_claude(key, prompt):
    for attempt in range(5):
        r = requests.post('https://api.anthropic.com/v1/messages', timeout=90,
                          headers={'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
                          json={'model': MODEL, 'max_tokens': 4000, 'thinking': {'type': 'disabled'},
                                'output_config': {'format': {'type': 'json_schema', 'schema': SCHEMA}},
                                'messages': [{'role': 'user', 'content': prompt}]})
        if r.status_code in (429, 500, 502, 503, 529):
            time.sleep(2 ** attempt * 3)
            continue
        if r.status_code >= 300:
            raise RuntimeError(f'Claude API {r.status_code}: {r.text[:200]}')
        raw = ''.join(b.get('text', '') for b in r.json().get('content', []) if b.get('type') == 'text')
        return json.loads(raw).get('events', [])
    raise RuntimeError('Claude API busy, gave up')


def mail_text(msg):
    """Readable text of an email: the plain part, else the HTML part turned into text."""
    plain_part = html_part = ''
    for part in msg.walk():
        if part.get_content_maintype() != 'text' or part.get_filename():
            continue
        body = part.get_payload(decode=True) or b''
        text = body.decode(part.get_content_charset() or 'utf-8', 'replace')
        if part.get_content_subtype() == 'plain' and not plain_part:
            plain_part = text
        elif part.get_content_subtype() == 'html' and not html_part:
            html_part = text
    return plain(plain_part or html_part)[:MAX_TEXT]


def header(msg, name):
    return str(make_header(decode_header(msg.get(name, '') or '')))


def to_row(ev, owner, mail_id, i):
    """One event from Claude as a pending events row, or None when the date or time cannot be read."""
    try:
        day = datetime.strptime(ev['date'], '%Y-%m-%d')
        tz = ZoneInfo(ev.get('timezone') or 'UTC')
    except (ValueError, KeyError):
        return None
    timed = bool(ev.get('start_time'))
    if timed:
        hh, mm = map(int, ev['start_time'].split(':'))
        start = day.replace(hour=hh, minute=mm, tzinfo=tz).astimezone(timezone.utc)
        end = None
        if ev.get('end_time'):
            eh, em = map(int, ev['end_time'].split(':'))
            end = day.replace(hour=eh, minute=em, tzinfo=tz).astimezone(timezone.utc)
            end = end if end > start else None
    else:   # all-day: stored at 12:00 UTC so the date is right everywhere (same rule as the feed importer)
        start, end = day.replace(hour=12, tzinfo=timezone.utc), None
    title = plain(ev.get('title'), 200)
    link = ev.get('link') if (ev.get('link') or '').startswith('http') else None
    desc = plain(ev.get('description'), 1800)
    if ev.get('price'):
        desc = (desc + '\n\nPrice: ' + plain(ev['price'], 200)).strip()
    return {
        'user_id': owner, 'title': title, 'description': desc or title,
        'event_type': event_type(title, []), 'start_date': start.isoformat(), 'end_date': end.isoformat() if end else None,
        'is_all_day': not timed, 'is_online': bool(ev.get('online')),
        'location_name': plain(ev.get('location_name')) or ('Online' if ev.get('online') else None),
        'address': plain(ev.get('address')) or None, 'city': plain(ev.get('city')) or None,
        'region': plain(ev.get('region')) or None, 'country': plain(ev.get('country')) or None,
        'online_url': link if ev.get('online') else None, 'ticket_url': link,
        'organizer_name': plain(ev.get('organizer')) or None, 'is_free': bool(re.search(r'\bfree\b', ev.get('price') or '', re.I)),
        'status': 'pending', 'source_event_id': f'mail:{mail_id}:{i}',
    }


def events_in(msg, key, owner):
    sent = parsedate_to_datetime(msg['Date']) if msg['Date'] else datetime.now(timezone.utc)
    prompt = PROMPT.format(sent=sent.strftime('%A %B %d, %Y'), sent_day=sent.strftime('%Y-%m-%d'),
                           sender=header(msg, 'From'), subject=header(msg, 'Subject'), text=mail_text(msg))
    mail_id = hashlib.sha1((msg.get('Message-ID') or prompt[:500]).encode()).hexdigest()[:16]
    rows = [to_row(ev, owner, mail_id, i) for i, ev in enumerate(ask_claude(key, prompt))]
    return [r for r in rows if r]


def supabase():
    url = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_SERVICE_KEY']
    H = {'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}
    users = requests.get(url + '/auth/v1/admin/users', headers=H, params={'per_page': 200}, timeout=20).json().get('users', [])
    owner = next((u['id'] for u in users if (u.get('email') or '').lower() in ADMIN_EMAILS and u.get('email_confirmed_at')), None)
    if not owner:
        sys.exit('no confirmed admin account to own the events')
    return url, H, owner


def words(title):
    return {w for w in re.findall(r'[a-z]{5,}', (title or '').lower())}


def already_listed(r, have):
    """Same title on the same day, or the same start time with a key word in common (titles are often worded differently)."""
    day, w = r['start_date'][:10], words(r['title'])
    for e in have:
        if norm(e['title']) == norm(r['title']) and e['start_date'][:10] == day:
            return True
        same_start = abs(datetime.fromisoformat(e['start_date']) - datetime.fromisoformat(r['start_date'])) <= timedelta(minutes=30)
        if same_start and w & words(e['title']):
            return True
        if e['start_date'][:10] == day and len(w & words(e['title'])) >= 2:   # e.g. all-day vs. a timed copy
            return True
    return False


def show(rows):
    for r in rows:
        print(f"    {r['start_date'][:16]}  {'all-day' if r['is_all_day'] else 'timed  '}  {r['title'][:60]}"
              f"  [{r['organizer_name'] or '?'} | {r['city'] or r['location_name'] or ''}]")


def main():
    load_env()
    akey = os.environ.get('ANTHROPIC_API_KEY')
    if '--test' in sys.argv:
        raw = open(sys.argv[sys.argv.index('--test') + 1], 'rb').read()
        msg = email.message_from_bytes(raw)
        if not msg.get_payload():   # plain text file, not a saved email
            msg = email.message_from_string('From: test\nSubject: test\nDate: ' + datetime.now(timezone.utc).strftime('%a, %d %b %Y %H:%M:%S +0000')
                                            + '\nContent-Type: text/plain; charset=utf-8\n\n' + raw.decode('utf-8', 'replace'))
        show(events_in(msg, akey, 'test'))
        return
    user, pw = os.environ.get('INBOX_USER'), os.environ.get('INBOX_APP_PASSWORD')
    if not (user and pw):
        print('INBOX_USER / INBOX_APP_PASSWORD not set: skipping the events inbox.')
        return
    dry = '--dry-run' in sys.argv
    url, H, owner = supabase()
    now = datetime.now(timezone.utc)
    have = requests.get(url + '/rest/v1/events', headers=H, timeout=30, params={
        'select': 'title,start_date,source_event_id', 'start_date': 'gte.' + (now - timedelta(days=1)).isoformat()}).json()
    known_ids = {e['source_event_id'] for e in have if e.get('source_event_id')}

    box = imaplib.IMAP4_SSL(os.environ.get('INBOX_HOST', 'imap.gmail.com'))
    box.login(user, pw)
    box.select('INBOX')
    ids = box.search(None, 'UNSEEN')[1][0].split()[:MAX_MAILS]
    rows = []
    for num in ids:
        msg = email.message_from_bytes(box.fetch(num, '(BODY.PEEK[])')[1][0][1])
        try:
            found = events_in(msg, akey, owner)
        except (RuntimeError, requests.RequestException, ValueError) as e:
            print(f"  skip email '{header(msg, 'Subject')[:60]}': {e}")
            continue
        new = [r for r in found if r['source_event_id'] not in known_ids and r['start_date'] >= now.isoformat()
               and not already_listed(r, have)]
        have += [{'title': r['title'], 'start_date': r['start_date']} for r in new]
        print(f"  '{header(msg, 'Subject')[:60]}': {len(found)} events, {len(new)} new")
        rows += new
        if not dry:
            box.store(num, '+FLAGS', '\\Seen')
    box.logout()
    show(rows)
    if dry or not rows:
        print('Dry run: nothing written.' if dry else 'Nothing new.')
        return
    r = requests.post(url + '/rest/v1/events', headers=H, data=json.dumps(rows), timeout=30)
    if not r.ok:
        sys.exit(f'insert failed: HTTP {r.status_code} {r.text[:300]}')
    print(f'Added {len(rows)} pending events (approve them in Admin > Events).')


if __name__ == '__main__':
    main()
