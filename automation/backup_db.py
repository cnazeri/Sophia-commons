#!/usr/bin/env python3
"""
Weekly backup of the Sophia Commons database (owner, 2026-11-18).

Reads every table and view the API exposes (listings, events, news, subscribers, reviews, outreach, ...)
with the server key, plus a list of the files in Storage, and writes one gzip'd JSON file. The code is
already in git; this covers the data. The weekly workflow encrypts the file before it leaves the runner
(the repository is public), so the backup never exists anywhere in readable form except on the owner's
computer after decrypting.

  python3 automation/backup_db.py backup.json.gz                 # the data
  python3 automation/backup_db.py backup.json.gz --files DIR     # also download every Storage file into DIR
Restore check:  gunzip -c backup.json.gz | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['counts'])"
Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY).
"""
import gzip
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import requests

PAGE = 1000
SKIP_COLUMNS = {'search_vector'}     # rebuilt by the database from the other columns


def env():
    for p in ('.env', '../.env'):
        if os.path.exists(p):
            for line in open(p):
                if '=' in line and not line.lstrip().startswith('#'):
                    k, v = line.strip().split('=', 1)
                    os.environ.setdefault(k, v.strip('"\''))
    url = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_SERVICE_KEY']
    return url, {'apikey': key, 'Authorization': 'Bearer ' + key}


def tables(url, H):
    spec = requests.get(url + '/rest/v1/', headers={**H, 'Accept': 'application/openapi+json'}, timeout=60).json()
    return sorted(p.strip('/') for p in spec.get('paths', {}) if p.count('/') == 1 and p != '/' and not p.startswith('/rpc'))


def dump(url, H, name):
    rows, off = [], 0
    while True:
        r = requests.get(f'{url}/rest/v1/{name}', headers={**H, 'Range-Unit': 'items', 'Range': f'{off}-{off + PAGE - 1}'},
                         params={'select': '*'}, timeout=120)
        if r.status_code >= 300:
            raise RuntimeError(f'{name}: HTTP {r.status_code} {r.text[:200]}')
        page = r.json()
        rows += [{k: v for k, v in row.items() if k not in SKIP_COLUMNS} for row in page]
        if len(page) < PAGE:
            return rows
        off += PAGE


def list_page(url, H, bucket, prefix, off):
    """One page of a Storage folder listing, retried: Storage can be slow for a minute."""
    for attempt in range(4):
        try:
            r = requests.post(f"{url}/storage/v1/object/list/{bucket}", headers=H, timeout=90,
                              json={'prefix': prefix, 'limit': PAGE, 'offset': off})
            if r.ok:
                return r.json()
        except requests.RequestException:
            if attempt == 3:
                raise
        time.sleep(5 * (attempt + 1))
    raise requests.RequestException(f'listing {bucket}/{prefix} failed')


def storage(url, H):
    out = {}
    for b in requests.get(url + '/storage/v1/bucket', headers=H, timeout=60).json():
        files, stack = [], ['']
        while stack:
            prefix = stack.pop()
            off = 0
            while True:
                items = list_page(url, H, b['id'], prefix, off)
                for it in items:
                    path = (prefix + '/' if prefix else '') + it['name']
                    if it.get('id') is None:
                        stack.append(path)          # a folder
                    else:
                        files.append({'path': path, 'size': (it.get('metadata') or {}).get('size'), 'updated_at': it.get('updated_at')})
                if len(items) < PAGE:
                    break
                off += PAGE
        out[b['id']] = {'public': b.get('public'), 'files': files}
    return out


def auth_users(url, H):
    """Member accounts (ids, emails, sign-up data). Passwords are never readable; members reset them after a restore."""
    users, page = [], 1
    while True:
        r = requests.get(url + '/auth/v1/admin/users', headers=H, params={'page': page, 'per_page': 1000}, timeout=60)
        r.raise_for_status()
        batch = r.json().get('users', [])
        users += batch
        if len(batch) < 1000:
            return users
        page += 1


def fetch_file(url, bucket, path, dest):
    """One Storage file, retried; False if it still fails (the backup goes on without it)."""
    for attempt in range(3):
        try:
            r = requests.get(f"{url}/storage/v1/object/public/{bucket}/{path}", timeout=60)
            if r.ok:
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                open(dest, 'wb').write(r.content)
                return True
            if r.status_code in (400, 404):
                return False
        except requests.RequestException:
            pass
        time.sleep(2 * (attempt + 1))
    return False


def download(url, files, folder):
    jobs = [(b, f['path'], os.path.join(folder, b, f['path'])) for b, v in files.items() for f in v['files']]
    with ThreadPoolExecutor(max_workers=12) as pool:
        ok = list(pool.map(lambda j: fetch_file(url, *j), jobs))
    missed = [j[0] + '/' + j[1] for j, good in zip(jobs, ok) if not good]
    if missed:
        print(f'{len(missed)} Storage files could not be downloaded, e.g. ' + ', '.join(missed[:5]))
    return sum(ok)


def main():
    args = [a for a in sys.argv[1:] if a != '--files']
    folder = sys.argv[sys.argv.index('--files') + 1] if '--files' in sys.argv else None
    if folder:
        args.remove(folder)
    if len(args) != 1:
        sys.exit(__doc__)
    sys.argv = [sys.argv[0], args[0]]
    url, H = env()
    data, counts, errors = {}, {}, {}
    for name in tables(url, H):
        try:
            data[name] = dump(url, H, name)
            counts[name] = len(data[name])
        except (RuntimeError, requests.RequestException, ValueError) as e:
            errors[name] = str(e)[:300]
    try:
        files = storage(url, H)
    except (requests.RequestException, ValueError) as e:
        files, errors['storage'] = {}, str(e)[:300]
    try:
        users = auth_users(url, H)
        counts['auth.users'] = len(users)
    except (requests.RequestException, ValueError) as e:
        users, errors['auth.users'] = [], str(e)[:300]
    out = {'made_at': datetime.now(timezone.utc).isoformat(), 'counts': counts, 'errors': errors,
           'storage': files, 'auth_users': users, 'tables': data}
    with gzip.open(sys.argv[1], 'wt', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, default=str)
    print(f'{len(counts)} tables, {sum(counts.values())} rows, '
          f'{sum(len(b["files"]) for b in files.values())} storage files listed -> {sys.argv[1]} '
          f'({os.path.getsize(sys.argv[1]) // 1024} KB)')
    if folder:
        print(f'{download(url, files, folder)} Storage files downloaded into {folder}')
    if errors:
        print('Not backed up: ' + ', '.join(f'{k} ({v[:80]})' for k, v in errors.items()))
    if len(errors) > len(counts):
        sys.exit('Most tables failed; backup is not usable.')
    if errors:
        sys.exit(1)    # stored anyway, but the run shows as failed so it gets looked at


if __name__ == '__main__':
    main()
