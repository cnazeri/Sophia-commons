#!/usr/bin/env python3
"""
Upcoming YouTube livestreams and premieres from the site's channels become calendar events (owner, 2026-10-31).

For each channel in youtube_channels, reads its latest uploads (scheduled streams and premieres are listed there
before they start) with the YouTube Data API, keeps videos whose broadcast is 'upcoming', and adds them as online
events linking to the video. Cost: about 2 API units per channel a day (the free quota is 10,000).
A stream that is already on the calendar (same video) is skipped; a repeating stream title only gets its next date.

Usage: python3 automation/youtube_events.py --dry-run   (prints, writes nothing)
       python3 automation/youtube_events.py             (daily workflow)
Env:   YOUTUBE_API_KEY (exits quietly without it), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY).
"""
import json
import os
import sys
from datetime import datetime, timezone

import requests

from events_from_feeds import ADMIN_EMAILS, load_env, norm, plain

API = 'https://www.googleapis.com/youtube/v3/'
RECENT = 10   # latest uploads checked per channel


def yt(path, key, **params):
    r = requests.get(API + path, params={**params, 'key': key}, timeout=20)
    r.raise_for_status()
    return r.json().get('items', [])


def upcoming(channel, key):
    """Scheduled streams and premieres among the channel's latest uploads."""
    uploads = 'UU' + channel['channel_id'][2:]
    ids = [i['contentDetails']['videoId'] for i in yt('playlistItems', key, part='contentDetails', playlistId=uploads, maxResults=RECENT)]
    if not ids:
        return []
    vids = yt('videos', key, part='snippet,liveStreamingDetails', id=','.join(ids))
    return [v for v in vids if v['snippet'].get('liveBroadcastContent') == 'upcoming'
            and (v.get('liveStreamingDetails') or {}).get('scheduledStartTime')]


def to_row(v, channel, owner):
    s = v['snippet']
    start = datetime.fromisoformat(v['liveStreamingDetails']['scheduledStartTime'].replace('Z', '+00:00'))
    thumbs = s.get('thumbnails') or {}
    img = next((thumbs[k]['url'] for k in ('maxres', 'standard', 'high') if k in thumbs), None)
    url = 'https://www.youtube.com/watch?v=' + v['id']
    title = plain(s.get('title'), 200)
    return {
        'user_id': owner, 'title': title,
        'description': plain(s.get('description'), 2000) or f"{title}, streamed live on YouTube by {channel['name']}.",
        'event_type': 'other', 'start_date': start.isoformat(), 'is_all_day': False,
        'location_name': 'Online (YouTube)', 'is_online': True, 'online_url': url, 'ticket_url': url,
        'organizer_name': channel['name'], 'organizer_url': 'https://www.youtube.com/channel/' + channel['channel_id'],
        'image_url': img, 'is_free': True, 'status': 'upcoming', 'source_event_id': 'yt:' + v['id'],
    }


def main():
    dry = '--dry-run' in sys.argv
    load_env()
    key = os.environ.get('YOUTUBE_API_KEY')
    if not key:
        print('YOUTUBE_API_KEY not set: skipping YouTube livestreams.')
        return
    url = os.environ['SUPABASE_URL'].rstrip('/')
    skey = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_SERVICE_KEY']
    H = {'apikey': skey, 'Authorization': 'Bearer ' + skey, 'Content-Type': 'application/json'}
    users = requests.get(url + '/auth/v1/admin/users', headers=H, params={'per_page': 200}, timeout=20).json().get('users', [])
    owner = next((u['id'] for u in users if (u.get('email') or '').lower() in ADMIN_EMAILS and u.get('email_confirmed_at')), None)
    if not owner:
        sys.exit('no confirmed admin account to own the events')
    channels = requests.get(url + '/rest/v1/youtube_channels', headers=H, timeout=20,
                            params={'select': 'channel_id,name', 'channel_id': 'like.UC*'}).json()
    now = datetime.now(timezone.utc).isoformat()
    have = requests.get(url + '/rest/v1/events', headers=H, timeout=30, params={
        'select': 'title,organizer_name,source_event_id', 'start_date': 'gte.' + now}).json()
    known_ids = {e['source_event_id'] for e in have if e.get('source_event_id')}
    known_series = {(norm(e['title']), e.get('organizer_name')) for e in have}

    rows = []
    for ch in channels:
        try:
            vids = upcoming(ch, key)
        except (requests.RequestException, ValueError, KeyError) as e:
            print(f"  skip {ch['name']}: {type(e).__name__}")
            continue
        for v in sorted(vids, key=lambda v: v['liveStreamingDetails']['scheduledStartTime']):
            r = to_row(v, ch, owner)
            k = (norm(r['title']), r['organizer_name'])
            if r['source_event_id'] in known_ids or k in known_series:
                continue
            known_series.add(k)
            rows.append(r)
    print(f'{len(channels)} channels checked, {len(rows)} new streams')
    for r in rows:
        print(f"    {r['start_date'][:16]}  {r['organizer_name'][:30]:30} {r['title'][:60]}")
    if dry or not rows:
        print('Dry run: nothing written.' if dry else 'Nothing new.')
        return
    r = requests.post(url + '/rest/v1/events', headers=H, data=json.dumps(rows), timeout=30)
    if not r.ok:
        sys.exit(f'insert failed: HTTP {r.status_code} {r.text[:300]}')
    print(f'Added {len(rows)} events.')


if __name__ == '__main__':
    main()
