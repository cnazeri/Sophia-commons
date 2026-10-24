#!/usr/bin/env python3
"""
Sophia Commons :: news roundup
==============================
Reads the RSS feeds in automation/news_sources.json and files articles from the last
MAX_AGE_DAYS as *pending* news (title, a short excerpt from the feed, source name and a link
to the original). Nothing is published until an admin clicks Publish in Admin > News queue.
Already-seen links are skipped (news.source_url is unique).

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.   Local test: python3 automation/news_roundup.py --dry-run
"""
import argparse, html, json, os, re, sys
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree as ET
import requests

ROOT = os.path.dirname(os.path.abspath(__file__))
UA = {'User-Agent': 'Mozilla/5.0 (compatible; SophiaCommonsBot/1.0; +https://sophiacommons.org)'}
MAX_AGE_DAYS = 21
ADMIN_EMAILS = ['cameron.nazeri@gmail.com', 'cameron@sophiacommons.org', 'admin@sophiacommons.org']
ATOM = '{http://www.w3.org/2005/Atom}'

# Google News searches (kind "gnews" in news_sources.json) bring in recent press coverage, since the
# movement's own feeds post only every few weeks (owner wants recent news on the home page, 2026-10-24).
# A headline must match the source's "must" pattern and none of NOISE: the searches also return
# obituaries, school sports, Waldorf the Maryland town and hotel, and Camp Hill, Pennsylvania.
GNEWS = 'https://news.google.com/rss/search'
NOISE = re.compile(r'obituar|volleyball|basketball|football|soccer|lacrosse|baseball|softball|\bNFHS\b|\bvs\.?\s|astoria|camp hill'
                   r'|voters? guide|election|real estate|for sale|police|arrest|crash|charged', re.I)

# Job and farm-opportunity posts (the Biodynamic Association UK feed carries many) go to the Jobs &
# Volunteering classifieds instead of the news, as active ads that expire after 90 days.
JOB_TITLE = re.compile(r'\b(wanted|vacanc\w*|jobs?|hiring|recruit\w*|apprentice\w*|assistant|tutor|grower|gardener|co-?workers?|internships?)\b'
                       r'|farming opportunit\w*', re.I)
JOBS_CATEGORY_ID = 11   # categories: Jobs and Volunteering


def place_from_title(title):
    """'Learning Assistant - Woodlands, Ruskin Mill Trust, Nailsworth, Glos' -> 'Nailsworth, Glos'."""
    parts = [p.strip() for p in re.split(r'\s*,\s*', title) if p.strip()]
    tail = [p for p in parts[1:] if len(p.split()) <= 2 and not re.search(r'time|now|farm|trust|college|house', p, re.I)]
    return ', '.join(tail[-2:])


def job_listing(title, desc, source_name, link, tags, owner):
    title = re.sub(r'\s+,', ',', re.sub(r'\s+', ' ', title)).strip()
    desc = (desc or title).strip() + (f'\n\nPosted by {source_name}.' if source_name else '')
    return {'user_id': owner, 'category_id': JOBS_CATEGORY_ID, 'title': title[:200], 'description': desc[:2000],
            'location': place_from_title(title) or None, 'country': 'UK' if 'UK' in (source_name or '') else None,
            'listing_type': 'offering', 'status': 'active', 'website_url': link,
            'tags': ['job', 'from-news'] + [t for t in (tags or []) if t != 'roundup']}


def clean(text, limit=280):
    t = html.unescape(re.sub(r'<[^>]+>', ' ', text or ''))
    t = re.sub(r'\s+', ' ', t).strip()
    t = re.sub(r'\s*(The post .* appeared first on .*|Continue reading.*|Read more.*|Weiterlesen.*)$', '', t, flags=re.I)
    t = t.replace('—', ', ').replace('–', '-')        # house style: no em or en dashes
    if len(t) <= limit:
        return t
    cut = t[:limit]
    return cut[:cut.rfind(' ')].rstrip(',;:') + '...'


def parse_date(s):
    if not s:
        return None
    try:
        d = parsedate_to_datetime(s)
    except (TypeError, ValueError):
        try:
            d = datetime.fromisoformat(s.replace('Z', '+00:00'))
        except ValueError:
            return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def read_gnews(src):
    from urllib.parse import urlencode
    url = GNEWS + '?' + urlencode({'q': src['query'] + ' when:30d', 'hl': 'en-US', 'gl': 'US', 'ceid': 'US:en'})
    r = requests.get(url, headers=UA, timeout=25)
    r.raise_for_status()
    must = re.compile(src['must'], re.I)
    items = []
    for it in ET.fromstring(r.content).iter('item'):
        title, pub = it.findtext('title') or '', (it.findtext('source') or '').strip()
        if pub and title.endswith(' - ' + pub):
            title = title[:-len(pub) - 3]
        if not must.search(title) or NOISE.search(title):
            continue
        items.append({'title': title, 'link': (it.findtext('link') or '').strip(), 'summary': '',
                      'date': parse_date(it.findtext('pubDate')), 'publisher': pub})
    return items


def read_feed(src):
    if src.get('kind') == 'gnews':
        return read_gnews(src)
    r = requests.get(src['feed'], headers=UA, timeout=25)
    r.raise_for_status()
    root = ET.fromstring(r.content)
    items = []
    for it in root.iter('item'):
        items.append({'title': it.findtext('title'), 'link': (it.findtext('link') or '').strip(),
                      'summary': it.findtext('description'), 'date': parse_date(it.findtext('pubDate'))})
    for it in root.iter(ATOM + 'entry'):
        link = it.find(ATOM + 'link')
        items.append({'title': it.findtext(ATOM + 'title'), 'link': link.get('href') if link is not None else '',
                      'summary': it.findtext(ATOM + 'summary') or it.findtext(ATOM + 'content'),
                      'date': parse_date(it.findtext(ATOM + 'updated') or it.findtext(ATOM + 'published'))})
    return items


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--days', type=int, default=MAX_AGE_DAYS, help='how far back to look (first run: 90)'); args = ap.parse_args()
    cfg = json.load(open(os.path.join(ROOT, 'news_sources.json'), encoding='utf-8'))
    url, key = os.environ.get('SUPABASE_URL'), os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        sys.exit('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set')
    H = {'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}
    rest = url.rstrip('/') + '/rest/v1/'
    users = requests.get(url.rstrip('/') + '/auth/v1/admin/users', headers=H, params={'per_page': 200}, timeout=20).json().get('users', [])
    owner = next((u['id'] for u in users if (u.get('email') or '').lower() in ADMIN_EMAILS and u.get('email_confirmed_at')), None)
    if not owner:
        sys.exit('no confirmed admin account to own the drafts')
    cutoff = datetime.now(timezone.utc) - timedelta(days=args.days)
    new, jobs, report = [], [], []
    # One story can turn up in several searches, and news_review.py swaps Google's link for the
    # publisher's, so also skip any title already filed in the last 90 days
    since = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    known = requests.get(rest + 'news', headers=H, params={'select': 'title', 'created_at': 'gte.' + since}, timeout=20).json()
    taken = {re.sub(r'\W+', ' ', (r.get('title') or '').lower()).strip() for r in known}
    for src in cfg['sources']:
        try:
            items = read_feed(src)
        except Exception as e:
            report.append('%s: feed failed (%s)' % (src['name'], type(e).__name__)); continue
        fresh = [i for i in items if i['link'].startswith('http') and i['title'] and i['date'] and i['date'] >= cutoff]
        if fresh:
            links = ','.join('"%s"' % i['link'].replace('"', '') for i in fresh)
            seen = {r['source_url'] for r in requests.get(rest + 'news', headers=H, params={'select': 'source_url', 'source_url': 'in.(%s)' % links}, timeout=20).json()}
            seen |= {r['website_url'] for r in requests.get(rest + 'listings', headers=H, params={'select': 'website_url', 'website_url': 'in.(%s)' % links}, timeout=20).json()}
            fresh = [i for i in fresh if i['link'] not in seen]
        fresh = [i for i in fresh if re.sub(r'\W+', ' ', i['title'].lower()).strip() not in taken]
        for i in fresh:
            taken.add(re.sub(r'\W+', ' ', i['title'].lower()).strip())
            if JOB_TITLE.search(i['title']):
                jobs.append(job_listing(clean(i['title'], 200), clean(i['summary'], 600), src['name'], i['link'], [src['topic'], src['lang'].lower()], owner))
                continue
            name = i.get('publisher') or src['name']
            new.append({'title': clean(i['title'], 200), 'excerpt': clean(i['summary']), 'body': clean(i['summary'], 600) or clean(i['title'], 200), 'source_name': name, 'source_url': i['link'],
                        'published_at': i['date'].isoformat(), 'status': 'pending', 'featured': False, 'user_id': owner,
                        'tags': ['roundup', src['topic'], src['lang'].lower()]})
        report.append('%s: %d new' % (src['name'], len(fresh)))
    print('\n'.join(report)); print('total new:', len(new), '| job ads for Jobs & Volunteering:', len(jobs))
    for j in jobs:
        print('  job:', j['title'])
    if args.dry_run or not (new or jobs):
        return
    if jobs:
        r = requests.post(rest + 'listings', headers={**H, 'Prefer': 'return=minimal'}, data=json.dumps(jobs), timeout=30)
        if r.status_code >= 300:
            sys.exit('job insert failed %s: %s' % (r.status_code, r.text[:300]))
        report.append('%d job ads posted to Jobs & Volunteering: %s' % (len(jobs), '; '.join(j['title'] for j in jobs)))
    if not new:
        return
    # news.status 'pending' keeps them off the site until an admin publishes them
    r = requests.post(rest + 'news', headers={**H, 'Prefer': 'return=minimal'}, data=json.dumps(new), timeout=30)
    if r.status_code >= 300:
        sys.exit('insert failed %s: %s' % (r.status_code, r.text[:300]))
    summ = os.environ.get('GITHUB_STEP_SUMMARY')
    if summ:
        open(summ, 'a').write('## News roundup\n\n' + '\n'.join('- ' + x for x in report) + '\n')


if __name__ == '__main__':
    main()
