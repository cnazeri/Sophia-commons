#!/usr/bin/env python3
"""
Link upcoming events to their directory listing (owner, 2026-11-02), so "Follow a group" emails can go out.

The follow emails (supabase/functions/event-follow) only announce events whose events.directory_entry_id points
at the listing people follow. Events from feeds and the inbox arrive without it. This script proposes a link for
each upcoming event that has none, using only strong signals:
  1. domain: the event's organizer_url, ticket_url or feed id (tribe:<domain>:...) has the same web domain as
     exactly one listing's website_url (shared sites like eventbrite or zoom are ignored);
     if several listings share that domain, the one whose name matches the organizer name exactly wins,
     otherwise the event is left alone;
  2. name: the organizer name equals exactly one listing's organization name (case and punctuation ignored).
Anything weaker is left unlinked. Events that already have a link are never changed.

Usage: python3 automation/link_events.py            (dry run: prints the proposed links, writes nothing)
       python3 automation/link_events.py --apply    (writes the links; owner runs this)
       python3 automation/link_events.py --selftest
Env:   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
"""
import os
import re
import sys
from datetime import date
from urllib.parse import urlparse

SHARED_DOMAINS = {
    'eventbrite.com', 'eventbrite.co.uk', 'eventbrite.ca', 'eventbrite.com.au', 'zoom.us', 'facebook.com',
    'youtube.com', 'youtu.be', 'meetup.com', 'google.com', 'forms.gle', 'linktr.ee', 'instagram.com',
    'humanitix.com', 'tickettailor.com', 'universe.com', 'squarespace.com', 'wixsite.com', 'wordpress.com',
    'gmail.com', 'paypal.com', 'airtable.com', 'jotform.com', 'tito.io', 'lu.ma', 'crowdcast.io',
}


def domain(url):
    if not url:
        return ''
    url = url.strip()
    if '://' not in url:
        url = 'https://' + url
    host = (urlparse(url).hostname or '').lower()
    return host[4:] if host.startswith('www.') else host


def norm(name):
    return re.sub(r'[^a-z0-9]+', ' ', (name or '').lower()).strip()


def event_domains(ev):
    out = [domain(ev.get('organizer_url')), domain(ev.get('ticket_url'))]
    m = re.match(r'tribe:([^:]+):', ev.get('source_event_id') or '')
    if m:
        out.append(domain(m.group(1)))
    return [d for d in dict.fromkeys(out) if d and d not in SHARED_DOMAINS]


def match(events, entries):
    """Return [(event, entry, reason)] for events without a link that have one clear listing."""
    by_domain, by_name = {}, {}
    for d in entries:
        dom = domain(d.get('website_url'))
        if dom and dom not in SHARED_DOMAINS:
            by_domain.setdefault(dom, []).append(d)
        n = norm(d.get('organization_name'))
        if n:
            by_name.setdefault(n, []).append(d)
    out = []
    for ev in events:
        if ev.get('directory_entry_id'):
            continue
        org = norm(ev.get('organizer_name'))
        hit = None
        for dom in event_domains(ev):
            cands = by_domain.get(dom, [])
            if len(cands) == 1:
                hit = (cands[0], f'same website {dom}')
            elif len(cands) > 1:
                named = [c for c in cands if org and norm(c['organization_name']) == org]
                if len(named) == 1:
                    hit = (named[0], f'same website {dom} and same name')
            if hit:
                break
        if not hit and org and len(by_name.get(org, [])) == 1:
            hit = (by_name[org][0], 'same name')
        if hit:
            out.append((ev, hit[0], hit[1]))
    return out


def fetch_all(url, H, table, params):
    import requests
    rows, start = [], 0
    while True:
        r = requests.get(f'{url}/rest/v1/{table}', headers={**H, 'Range': f'{start}-{start + 999}'},
                         params=params, timeout=30)
        r.raise_for_status()
        page = r.json()
        rows += page
        if len(page) < 1000:
            return rows
        start += 1000


def main():
    if '--selftest' in sys.argv:
        return selftest()
    import requests
    url = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_SERVICE_KEY']
    H = {'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}
    events = fetch_all(url, H, 'events', {
        'select': 'id,title,start_date,organizer_name,organizer_url,ticket_url,source_event_id,directory_entry_id',
        'status': 'in.(upcoming,ongoing)', 'start_date': 'gte.' + date.today().isoformat(), 'order': 'start_date'})
    entries = fetch_all(url, H, 'directory_entries', {
        'select': 'id,organization_name,website_url', 'status': 'eq.approved'})
    links = match(events, entries)
    open_events = [e for e in events if not e.get('directory_entry_id')]
    print(f'{len(events)} upcoming events, {len(events) - len(open_events)} already linked, '
          f'{len(links)} can be linked, {len(open_events) - len(links)} left unlinked.')
    for ev, d, why in links:
        print(f'  {ev["start_date"]}  {ev["title"][:60]}  ->  {d["organization_name"]}  ({why})')
    linked_ids = {ev['id'] for ev, _, _ in links}
    left = [e for e in open_events if e['id'] not in linked_ids]
    if left:
        print('Left unlinked (no clear listing):')
        for e in left:
            print(f'  {e["start_date"]}  {e["title"][:60]}  (organizer: {e.get("organizer_name") or "none"})')
    if '--apply' not in sys.argv:
        print('Dry run: nothing written. Add --apply to save these links.')
        return
    done = 0
    for ev, d, _ in links:
        r = requests.patch(f'{url}/rest/v1/events', headers={**H, 'Prefer': 'return=minimal'},
                           params={'id': 'eq.' + ev['id'], 'directory_entry_id': 'is.null'},
                           json={'directory_entry_id': d['id']}, timeout=30)
        if r.ok:
            done += 1
        else:
            print(f'  failed: {ev["title"][:60]} ({r.status_code})')
    print(f'Linked {done} of {len(links)} events.')


def selftest():
    entries = [
        {'id': 'a', 'organization_name': 'Anthroposophical Society in Canada', 'website_url': 'https://anthroposophy.ca/'},
        {'id': 'b', 'organization_name': 'Goetheanum', 'website_url': 'https://goetheanum.ch'},
        {'id': 'c', 'organization_name': 'Goetheanum Medical Section', 'website_url': 'goetheanum.ch'},
        {'id': 'd', 'organization_name': 'Camphill Village', 'website_url': 'https://www.eventbrite.com/o/x'},
        {'id': 'e', 'organization_name': 'Rudolf Steiner House', 'website_url': ''},
    ]
    events = [
        {'id': 1, 'organizer_url': 'https://www.anthroposophy.ca/events'},
        {'id': 2, 'organizer_name': 'goetheanum', 'organizer_url': 'https://goetheanum.ch/en'},
        {'id': 3, 'organizer_name': 'Someone else', 'organizer_url': 'https://goetheanum.ch/en'},
        {'id': 4, 'ticket_url': 'https://www.eventbrite.com/e/1'},
        {'id': 5, 'organizer_name': 'Rudolf Steiner House.'},
        {'id': 6, 'source_event_id': 'tribe:www.anthroposophy.ca:16812'},
        {'id': 7, 'organizer_url': 'https://anthroposophy.ca', 'directory_entry_id': 'zzz'},
    ]
    got = {ev['id']: (d['id'], why) for ev, d, why in match(events, entries)}
    assert got[1][0] == 'a', got
    assert got[2][0] == 'b' and 'same name' in got[2][1], got
    assert 3 not in got, got          # shared domain, name does not decide it
    assert 4 not in got, got          # eventbrite is never a signal
    assert got[5] == ('e', 'same name'), got
    assert got[6][0] == 'a', got
    assert 7 not in got, got          # existing links are never changed
    print('selftest passed')


if __name__ == '__main__':
    main()
