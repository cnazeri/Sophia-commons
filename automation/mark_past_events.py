#!/usr/bin/env python3
"""
Mark events that have ended as 'past' (they otherwise stay 'upcoming' forever).

An event has ended when its end_date (or, without one, its start_date) is more than 12 hours ago,
so an evening talk in California is not closed while it is still the same day there.

Safety: past event pages must stay readable, which needs the public read policy from
backend/migrations/RUN_THIS_2026-10-20_past_events.sql. The script marks one event first and
reads it back with the public (anon) key; if the public cannot see it, it puts that one back and stops.

Usage: python3 automation/mark_past_events.py            (preview)
       python3 automation/mark_past_events.py --apply    (writes; used by the daily workflow)
Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY), and the public anon key is
read from the deployed sb-init.js.
"""
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import requests

URL = os.environ['SUPABASE_URL'].rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_SERVICE_KEY']
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'}
GRACE = timedelta(hours=12)


def anon_key() -> str:
    js = requests.get('https://sophiacommons.org/sb-init.js', timeout=20).text
    m = re.search(r"const SUPABASE_ANON_KEY = '([^']+)'", js)
    if not m:
        sys.exit('could not read the public key from sb-init.js')
    return m.group(1)


def public_can_read_past(event_id: str) -> bool:
    k = anon_key()
    r = requests.get(URL + '/rest/v1/events', timeout=20, params={'select': 'id', 'id': 'eq.' + event_id},
                     headers={'apikey': k, 'Authorization': 'Bearer ' + k})
    return r.ok and len(r.json()) == 1


def main() -> None:
    apply = '--apply' in sys.argv
    cutoff = (datetime.now(timezone.utc) - GRACE).isoformat()
    r = requests.get(URL + '/rest/v1/events', headers=H, timeout=30, params={
        'select': 'id,title,start_date,end_date', 'status': 'in.(upcoming,ongoing)',
        'or': f'(end_date.lt.{cutoff},and(end_date.is.null,start_date.lt.{cutoff}))'})
    r.raise_for_status()
    ended = r.json()
    print(f'{len(ended)} ended events still marked upcoming/ongoing')
    for e in ended[:10]:
        print('  ', (e.get('end_date') or e['start_date'])[:10], e['title'][:70])
    if not apply or not ended:
        return
    # Mark one, confirm the public can still read it, then the rest (undo the first if not)
    first = ended[0]['id']
    requests.patch(URL + '/rest/v1/events', headers=H, timeout=20, params={'id': 'eq.' + first},
                   json={'status': 'past'}).raise_for_status()
    if not public_can_read_past(first):
        requests.patch(URL + '/rest/v1/events', headers=H, timeout=20, params={'id': 'eq.' + first},
                       json={'status': 'upcoming'}).raise_for_status()
        sys.exit('Stopped: the public cannot read past events yet. Run '
                 'backend/migrations/RUN_THIS_2026-10-20_past_events.sql first. Nothing changed.')
    ids = ','.join(e['id'] for e in ended[1:])
    if ids:
        requests.patch(URL + '/rest/v1/events', headers=H, timeout=30, params={'id': f'in.({ids})'},
                       json={'status': 'past'}).raise_for_status()
    print(f'Marked {len(ended)} as past')


if __name__ == '__main__':
    main()
