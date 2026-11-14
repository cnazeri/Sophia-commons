"""Find a picture for upcoming events that have none (owner, 2026-11-14).

Order of sources for each event:
  1. the share image (og:image / twitter:image) on the event's ticket page, then its organizer page
  2. the picture of the directory listing the event is linked to
Events in one series share the same picture. Runs daily in .github/workflows/event-images.yml; the pictures
it sets show on each card under Admin > Pending Events, so the owner sees them before accepting.

  python3 automation/scan_event_images.py           preview: downloads to --out, writes plan.json, changes nothing
  python3 automation/scan_event_images.py --apply      uploads to event-images/scanned/ and sets events.image_url
                                                    (only for events still without a picture; undo list in scripts/backups/)
  --skip id1,id2                                    leave these events out (pictures that looked wrong)
"""
import argparse, hashlib, html, io, json, os, re, sys, time, urllib.parse
import requests
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Keys: from the environment (GitHub Actions), else from the repo's .env (local runs)
_envfile = os.path.join(ROOT, '.env')
env = dict(l.strip().split('=', 1) for l in open(_envfile) if '=' in l and not l.startswith('#')) if os.path.exists(_envfile) else {}
URL = (os.environ.get('SUPABASE_URL') or env.get('SUPABASE_URL', '')).strip('"')
KEY = (os.environ.get('SUPABASE_SERVICE_KEY') or env.get('SUPABASE_SERVICE_KEY', '')).strip('"')
if not URL or not KEY:
    sys.exit('SUPABASE_URL and SUPABASE_SERVICE_KEY are needed')
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'}
MIN_W, MIN_H, MAX_BYTES = 400, 200, 8 * 1024 * 1024
META = re.compile(r'<meta\b[^>]*>', re.I)
IMG = re.compile(r'<img\b[^>]*?\bsrc\s*=\s*["\']([^"\']+\.(?:jpe?g|png|webp)(?:\?[^"\']*)?)["\']', re.I)
NOT_PHOTO = re.compile(r'logo|icon|favicon|avatar|sprite|badge|flag|payment|banner-ad|maintenance|staticimages', re.I)
SKIP_HOSTS = ('zoom.us', 'meet.google.com', 'teams.microsoft.com', 'us02web.zoom.us')


def rest(path):
    out, start = [], 0
    while True:
        r = requests.get(f'{URL}/rest/v1/{path}', headers={**H, 'Range': f'{start}-{start + 999}'}, timeout=30)
        r.raise_for_status()
        rows = r.json()
        out += rows
        if len(rows) < 1000:
            return out
        start += 1000


def share_image(page_url):
    """Picture URLs found on a page (share image first), absolute https only; [] when the page cannot be read."""
    host = urllib.parse.urlparse(page_url).hostname or ''
    if any(host.endswith(h) for h in SKIP_HOSTS):
        return []
    try:
        r = requests.get(page_url, headers=UA, timeout=20)
    except requests.RequestException:
        return []
    if r.status_code != 200 or 'html' not in r.headers.get('content-type', ''):
        return []
    found = {}
    for tag in META.findall(r.text[:400000]):
        key = re.search(r'(?:property|name)\s*=\s*["\']([^"\']+)', tag, re.I)
        val = re.search(r'content\s*=\s*["\']([^"\']+)', tag, re.I)
        if key and val:
            found.setdefault(key.group(1).lower(), html.unescape(val.group(1)).strip())
    # The share image first, then up to 6 pictures from the page itself (logos and icons are dropped by name or size)
    picks = [found.get('og:image') or found.get('og:image:url') or found.get('twitter:image')]
    picks += [m for m in IMG.findall(r.text[:400000]) if not NOT_PHOTO.search(m)][:6]
    out = []
    for img in picks:
        if img:
            img = urllib.parse.urljoin(r.url, html.unescape(img))
            if img.startswith('https://') and img not in out:
                out.append(img)
    return out


def fetch_image(img_url):
    """(bytes, ext, (w, h)) for a usable picture, or None."""
    try:
        r = requests.get(img_url, headers=UA, timeout=30)
    except requests.RequestException:
        return None
    if r.status_code != 200 or len(r.content) > MAX_BYTES:
        return None
    try:
        im = Image.open(io.BytesIO(r.content))
        fmt, size = im.format, im.size
    except Exception:
        return None
    ext = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp'}.get(fmt)
    if not ext or size[0] < MIN_W or size[1] < MIN_H:
        return None
    return r.content, ext, size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--out', default=os.path.join(ROOT, 'scripts', 'event_images', 'scanned'))
    ap.add_argument('--skip', default='')
    a = ap.parse_args()
    skip = {s.strip() for s in a.skip.split(',') if s.strip()}
    with open(os.path.join(ROOT, 'automation', 'event_image_skip.json')) as f:
        skip |= set(json.load(f)['skip'])
    os.makedirs(a.out, exist_ok=True)
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

    events = rest('events?select=id,title,series_id,ticket_url,organizer_url,directory_entry_id,start_date,end_date'
                  '&image_url=is.null&status=in.(upcoming,ongoing,pending)'
                  f'&or=(end_date.gte.{now},and(end_date.is.null,start_date.gte.{now}))&order=start_date')
    events = [e for e in events if e['id'] not in skip and e['id'][:8] not in skip]
    listing_ids = sorted({e['directory_entry_id'] for e in events if e['directory_entry_id']})
    listings = {}
    for i in range(0, len(listing_ids), 100):
        ids = ','.join(listing_ids[i:i + 100])
        for d in rest(f'directory_entries?select=id,photo_url&id=in.({ids})'):
            listings[d['id']] = d['photo_url']

    plan, by_group, page_cache = [], {}, {}
    for e in events:
        group = e['series_id'] or e['id']
        if group in by_group:
            if by_group[group]:
                plan.append({**by_group[group], 'id': e['id'], 'title': e['title']})
            continue
        choice = None
        for page in [e['ticket_url'], e['organizer_url']]:
            if not page:
                continue
            if page not in page_cache:
                page_cache[page] = share_image(page)
                time.sleep(1)
            for n, img in enumerate(page_cache[page]):
                if NOT_PHOTO.search(img):
                    continue
                got = fetch_image(img)
                if got:
                    choice = {'source': 'page' if n == 0 else 'page img', 'from': page, 'image': img, 'got': got}
                    break
            if choice:
                break
        if not choice and listings.get(e['directory_entry_id']):
            photo = listings[e['directory_entry_id']]
            got = fetch_image(photo.split('#')[0])
            if got:
                choice = {'source': 'listing logo' if photo.endswith('#contain') else 'listing', 'from': 'listing', 'image': photo, 'got': got}
        if not choice:
            by_group[group] = None
            print('none   ', e['id'][:8], e['title'][:70])
            continue
        data, ext, size = choice.pop('got')
        name = hashlib.sha1(data).hexdigest()[:16] + '.' + ext
        with open(os.path.join(a.out, name), 'wb') as f:
            f.write(data)
        item = {**choice, 'file': name, 'size': list(size)}
        by_group[group] = item
        plan.append({**item, 'id': e['id'], 'title': e['title']})
        print(f"{choice['source']:<7}", e['id'][:8], e['title'][:60], size)

    with open(os.path.join(a.out, 'plan.json'), 'w') as f:
        json.dump(plan, f, indent=1)
    print(f'\n{len(plan)} of {len(events)} events have a picture to use; plan in {a.out}/plan.json')
    if not a.apply:
        return

    undo, uploaded = [], {}
    for p in plan:
        if p['file'] not in uploaded:
            path = f"event-images/scanned/{p['file']}"
            ctype = {'jpg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp'}[p['file'].rsplit('.', 1)[1]]
            r = requests.post(f'{URL}/storage/v1/object/{path}', data=open(os.path.join(a.out, p['file']), 'rb').read(),
                              headers={**H, 'Content-Type': ctype, 'x-upsert': 'true', 'Cache-Control': '86400'}, timeout=60)
            r.raise_for_status()
            uploaded[p['file']] = f'{URL}/storage/v1/object/public/{path}'
            if p['source'] == 'listing logo':
                uploaded[p['file']] += '#contain'
        # image_url=is.null: never replace a picture someone added in the meantime
        r = requests.patch(f"{URL}/rest/v1/events?id=eq.{p['id']}&image_url=is.null", json={'image_url': uploaded[p['file']]},
                           headers={**H, 'Prefer': 'return=representation'}, timeout=30)
        r.raise_for_status()
        if r.json():
            undo.append(p['id'])
    os.makedirs(os.path.join(ROOT, 'scripts', 'backups'), exist_ok=True)
    undo_path = os.path.join(ROOT, 'scripts', 'backups', f"event_images_scanned_{time.strftime('%Y-%m-%d_%H%M')}.json")
    with open(undo_path, 'w') as f:
        json.dump(undo, f)
    print(f'set {len(undo)} event pictures; undo list (set image_url back to null) in {undo_path}')


if __name__ == '__main__':
    sys.exit(main())
