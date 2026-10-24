#!/usr/bin/env python3
"""
Sophia Commons :: daily news review
===================================
Runs after news_roundup.py so the owner does not have to review the queue by hand (owner, 2026-10-24).
For every pending roundup story it:
  1. finds the real article (Google News links are resolved to the publisher's page),
  2. reads the article's own publish date and text from that page,
  3. rejects anything older than MAX_AGE_DAYS by the page's date,
  4. asks Claude whether the story is really about the anthroposophical movement,
  5. publishes or rejects it, with the page's date, a short summary and the publisher's link.
Every decision gets a tag (review:published, review:off-topic, review:too-old, ...) so the owner can
check later in Admin > News.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY.
Local test without changing anything: python3 automation/news_review.py --dry-run
"""
import argparse, html, json, os, re, sys, time
from datetime import datetime, timedelta, timezone
import requests

MODEL = os.environ.get('NEWS_REVIEW_MODEL', 'claude-haiku-5-5')
MAX_AGE_DAYS = 30            # same window as the home page News slider
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'}
REASONS = ['on-topic', 'off-topic', 'duplicate', 'job-ad', 'obituary', 'sports', 'advert', 'not-english', 'too-thin']

PROMPT = """You review news for Sophia Commons, a directory and news site for the anthroposophical community:
Waldorf / Steiner education, biodynamic farming and wine, anthroposophic medicine and therapies, Camphill
communities, eurythmy and the arts, The Christian Community, the Goetheanum and anthroposophical societies.

Decide whether this story belongs on the site's News page.
Publish only when the story is mainly about one of those subjects or a named organization in that movement.
Reject when:
- the word only appears in passing (a person who once attended a Waldorf school, a hotel or town called Waldorf
  or Camp Hill, a list of many schools),
- it is a job ad, an obituary, a sports result, an advert or a product promotion,
- it is not in English,
- it repeats a story already published (list below), even from another publisher,
- there is too little to go on (no article text and a vague headline).

Stories already published in the last 30 days:
{published}

The story:
HEADLINE: {title}
PUBLISHER: {publisher}
URL: {url}
ARTICLE TEXT (from the page, may be cut short or missing):
{text}

Also write a summary of 1 or 2 plain sentences (under 260 characters) saying what happened, using only facts in
the article text or headline. No hype, no em or en dashes, straight quotes only."""

SCHEMA = {
    'type': 'object', 'additionalProperties': False,
    'properties': {
        'publish': {'type': 'boolean'},
        'reason': {'type': 'string', 'enum': REASONS},
        'note': {'type': 'string', 'description': 'One short sentence explaining the decision.'},
        'summary': {'type': 'string'},
    },
    'required': ['publish', 'reason', 'note', 'summary'],
}


# ── Google News links point at a Google page; this asks Google for the publisher's URL ──
def resolve_gnews(link):
    m = re.search(r'news\.google\.com/(?:rss/)?articles/([^?/]+)', link or '')
    if not m:
        return link
    gid = m.group(1)
    try:
        page = requests.get('https://news.google.com/rss/articles/' + gid, headers=UA, timeout=20).text
        sg, ts = re.search(r'data-n-a-sg="([^"]+)"', page), re.search(r'data-n-a-ts="([^"]+)"', page)
        if not (sg and ts):
            return link
        inner = ['garturlreq', [['X', 'X', ['X', 'X'], None, None, 1, 1, 'US:en', None, 1, None, None, None, None, None, 0, 1],
                                'X', 'X', 1, [1, 1, 1], 1, 1, None, 0, 0, None, 0], gid, int(ts.group(1)), sg.group(1)]
        r = requests.post('https://news.google.com/_/DotsSplashUi/data/batchexecute',
                          headers={**UA, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'},
                          data={'f.req': json.dumps([[['Fbv4je', json.dumps(inner), None, 'generic']]])}, timeout=20)
        hit = re.search(r'\[\\"garturlres\\",\\"(https?://[^\\"]+)', r.text)
        return hit.group(1) if hit else link
    except requests.RequestException:
        return link


# ── Read the article page: its own publish date, description and some text ──
DATE_PATTERNS = [
    r'<meta[^>]+(?:property|name|itemprop)=["\'](?:article:published_time|og:article:published_time|datePublished|pubdate|publishdate|date|dc\.date|parsely-pub-date|sailthru\.date)["\'][^>]+content=["\']([^"\']+)',
    r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name|itemprop)=["\'](?:article:published_time|datePublished|pubdate|publishdate|date)["\']',
    r'"datePublished"\s*:\s*"([^"]+)"',
    r'<time[^>]+datetime=["\']([^"\']+)',
]


def parse_when(s):
    s = (s or '').strip()
    for fmt in (None, '%Y-%m-%d', '%Y/%m/%d', '%d.%m.%Y'):
        try:
            d = datetime.fromisoformat(s.replace('Z', '+00:00')) if fmt is None else datetime.strptime(s[:10], fmt)
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def meta(page, name):
    m = re.search(r'<meta[^>]+(?:property|name)=["\']%s["\'][^>]+content=["\']([^"\']*)' % re.escape(name), page, re.I) \
        or re.search(r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']%s["\']' % re.escape(name), page, re.I)
    return html.unescape(m.group(1)).strip() if m else ''


def read_article(url):
    out = {'url': url, 'date': None, 'text': '', 'ok': False}
    try:
        r = requests.get(url, headers=UA, timeout=25)
        if r.status_code >= 400 or 'html' not in r.headers.get('content-type', ''):
            return out
        page = r.text
        out['url'], out['ok'] = r.url, True
    except requests.RequestException:
        return out
    now = datetime.now(timezone.utc)
    for pat in DATE_PATTERNS:
        for raw in re.findall(pat, page, re.I)[:3]:
            d = parse_when(raw)
            if d and d <= now + timedelta(days=1) and d.year >= 2000:
                out['date'] = d
                break
        if out['date']:
            break
    desc = meta(page, 'og:description') or meta(page, 'description')
    body = re.sub(r'(?is)<(script|style|noscript|nav|header|footer)[^>]*>.*?</\1>', ' ', page)
    paras = [html.unescape(re.sub(r'<[^>]+>', ' ', p)) for p in re.findall(r'(?is)<p[^>]*>(.*?)</p>', body)]
    paras = [re.sub(r'\s+', ' ', p).strip() for p in paras]
    text = ' '.join(p for p in paras if len(p) > 60)
    out['text'] = ((desc + '\n') if desc else '') + text[:3500]
    return out


def ask_claude(key, prompt):
    for attempt in range(5):
        r = requests.post('https://api.anthropic.com/v1/messages', timeout=60,
                          headers={'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
                          json={'model': MODEL, 'max_tokens': 1000, 'thinking': {'type': 'disabled'},   # short task; thinking used up the budget
                                'output_config': {'format': {'type': 'json_schema', 'schema': SCHEMA}},
                                'messages': [{'role': 'user', 'content': prompt}]})
        if r.status_code in (429, 500, 502, 503, 529):
            time.sleep(2 ** attempt * 3)
            continue
        if r.status_code >= 300:
            raise RuntimeError('Claude API %s: %s' % (r.status_code, r.text[:200]))
        raw = ''.join(b.get('text', '') for b in r.json().get('content', []) if b.get('type') == 'text')
        out = json.loads(raw)
        if out.get('reason') not in REASONS:
            out['reason'] = 'off-topic' if not out.get('publish') else 'on-topic'
        return out
    raise RuntimeError('Claude API busy, gave up')


def tidy(s, limit):
    s = re.sub(r'\s+', ' ', (s or '').replace('—', ', ').replace('–', '-')
               .replace('“', '"').replace('”', '"').replace('‘', "'").replace('’', "'")).strip()
    return s if len(s) <= limit else s[:limit].rsplit(' ', 1)[0].rstrip(',;:') + '...'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true', help='decide and print, change nothing')
    ap.add_argument('--status', default='pending', help='which stories to review (testing: --status published --dry-run)')
    args = ap.parse_args()
    url, skey, akey = os.environ.get('SUPABASE_URL'), os.environ.get('SUPABASE_SERVICE_ROLE_KEY'), os.environ.get('ANTHROPIC_API_KEY')
    if not (url and skey and akey):
        sys.exit('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ANTHROPIC_API_KEY must be set')
    H = {'apikey': skey, 'Authorization': 'Bearer ' + skey, 'Content-Type': 'application/json'}
    rest = url.rstrip('/') + '/rest/v1/news'
    pending = requests.get(rest, headers=H, timeout=20, params={
        'select': 'id,title,source_name,source_url,published_at,tags', 'status': 'eq.' + args.status,
        'tags': 'cs.{roundup}', 'order': 'published_at.desc', 'limit': '60'}).json()
    since = (datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)).isoformat()
    published = [n['title'] for n in requests.get(rest, headers=H, timeout=20, params={
        'select': 'title', 'status': 'eq.published', 'published_at': 'gte.' + since}).json()]
    cutoff = datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)
    lines, counts = [], {}
    for n in pending:
        real = resolve_gnews(n['source_url'])
        art = read_article(real)
        feed_date = parse_when(n.get('published_at'))
        when = art['date'] or feed_date
        tags = [t for t in (n.get('tags') or []) if not t.startswith('review:')]
        patch = {}
        if when and when < cutoff:
            verdict = {'publish': False, 'reason': 'too-old', 'note': 'The article page is dated %s.' % when.date(), 'summary': ''}
        else:
            verdict = ask_claude(akey, PROMPT.format(
                published='\n'.join('- ' + t for t in published[-60:] if t != n['title']) or '(none)', title=n['title'],
                publisher=n.get('source_name') or '', url=art['url'], text=art['text'] or '(the page could not be read)'))
        status = 'published' if verdict['publish'] else 'rejected'
        patch['status'] = status
        patch['tags'] = tags + ['review:' + ('published' if verdict['publish'] else verdict['reason'])]
        if verdict['publish']:
            published.append(n['title'])
            if when:
                patch['published_at'] = when.isoformat()
            if art['ok'] and art['url'].startswith('http') and 'news.google.com' not in art['url']:
                patch['source_url'] = art['url']   # the publisher's page, not Google's redirect
            if verdict.get('summary'):
                patch['excerpt'] = tidy(verdict['summary'], 280)
                patch['body'] = tidy(verdict['summary'], 600)
        counts[status] = counts.get(status, 0) + 1
        line = '%s  %s  %s | %s (%s)' % (status.upper()[:4], (when.date() if when else '????-??-??'), n['title'][:80], verdict['reason'], verdict.get('note', '')[:120])
        lines.append(line)
        print(line)
        if not args.dry_run:
            r = requests.patch(rest, headers={**H, 'Prefer': 'return=minimal'}, params={'id': 'eq.' + n['id']}, data=json.dumps(patch), timeout=20)
            if r.status_code >= 300:
                print('  update failed %s: %s' % (r.status_code, r.text[:200]))
    print('reviewed %d: %s%s' % (len(pending), ', '.join('%s %d' % kv for kv in counts.items()) or 'nothing waiting', ' (dry run)' if args.dry_run else ''))
    summ = os.environ.get('GITHUB_STEP_SUMMARY')
    if summ and lines:
        open(summ, 'a').write('## News review\n\n' + '\n'.join('- ' + l for l in lines) + '\n')


if __name__ == '__main__':
    main()
