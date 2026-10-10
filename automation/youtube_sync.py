#!/usr/bin/env python3
"""
Sophia Commons :: weekly YouTube sync
=====================================
1. Reads automation/youtube_channels.json (the curated list you edit by hand).
2. Resolves any missing channel_id by fetching the channel page once.
3. Pulls each channel's public RSS feed (no API key, ~15 newest videos).
4. Upserts channels + videos into Supabase (REST, service-role key).
5. Writes automation/youtube_feed.json (a committed snapshot, handy for debugging).
6. Optional discovery: if YOUTUBE_API_KEY is set, searches YouTube for new
   anthroposophy channels and files unknown ones into youtube_channels_pending
   for you to approve in the admin panel.

Env (GitHub Actions secrets):
  SUPABASE_URL               https://xxxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY  service role key (never ships to the browser)
  YOUTUBE_API_KEY            optional, enables discovery

Run locally:  python3 automation/youtube_sync.py --dry-run
"""
import json, os, re, sys, time, argparse
from datetime import datetime, timezone
from xml.etree import ElementTree as ET
import requests

ROOT = os.path.dirname(os.path.abspath(__file__))
CHANNELS_FILE = os.path.join(ROOT, "youtube_channels.json")
FEED_FILE = os.path.join(ROOT, "youtube_feed.json")
UA = {"User-Agent": "Mozilla/5.0 (compatible; SophiaCommonsBot/1.0; +https://sophiacommons.org)",
      "Accept-Language": "en-US,en;q=0.8"}
RSS = "https://www.youtube.com/feeds/videos.xml?channel_id={}"
NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015",
      "media": "http://search.yahoo.com/mrss/"}

DISCOVERY_QUERIES = ["anthroposophy", "Rudolf Steiner lecture", "Waldorf education", "biodynamic farming",
                     "eurythmy", "anthroposophic medicine", "Camphill community", "Anthroposophie",
                     "antroposofía", "антропософия", "Goetheanum"]


def log(*a):
    print(datetime.now(timezone.utc).strftime("%H:%M:%S"), *a, flush=True)


# ── channel id resolution ───────────────────────────────────────────────────
def resolve_channel_id(url):
    """Return the UC... id for a /@handle, /c/name, /user/name or /channel/UC... URL.
    Only trusts the page's own canonical id (a bare "channelId" match is often a *featured* channel)."""
    m = re.search(r"/channel/(UC[\w-]{22})", url)
    if m:
        return m.group(1)
    try:
        r = requests.get(url, headers={**UA, "Cookie": "CONSENT=YES+1; SOCS=CAI"}, timeout=20)
        if r.status_code != 200:
            log("  ! %s -> HTTP %s" % (url, r.status_code))
            return None
    except Exception as e:
        log("  ! could not fetch", url, e)
        return None
    for pat in (r'<link rel="canonical" href="https://www\.youtube\.com/channel/(UC[\w-]{22})"',
                r'"externalId":"(UC[\w-]{22})"',
                r'<meta itemprop="identifier" content="(UC[\w-]{22})"',
                r'"browseId":"(UC[\w-]{22})"'):
        m = re.search(pat, r.text)
        if m:
            return m.group(1)
    return None


# ── RSS (with retries) + channel-page fallback ──────────────────────────────
BROWSER_UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
              "Accept-Language": "en-US,en;q=0.8", "Cookie": "CONSENT=YES+1; SOCS=CAI; PREF=hl=en"}

def _parse_feed(content):
    root = ET.fromstring(content)
    title = root.findtext("a:title", default="", namespaces=NS)
    videos = []
    for e in root.findall("a:entry", NS):
        vid = e.findtext("yt:videoId", default="", namespaces=NS)
        if not vid:
            continue
        thumb = e.find("media:group/media:thumbnail", NS)
        desc = (e.findtext("media:group/media:description", default="", namespaces=NS) or "").strip()
        videos.append({
            "video_id": vid,
            "title": e.findtext("a:title", default="", namespaces=NS)[:300],
            "url": "https://www.youtube.com/watch?v=" + vid,
            "thumbnail_url": thumb.get("url") if thumb is not None else "https://i.ytimg.com/vi/%s/hqdefault.jpg" % vid,
            "published_at": e.findtext("a:published", default=None, namespaces=NS),
            "description": desc[:2000] or None,
        })
    return title, videos


def fetch_feed(channel_id):
    """YouTube's feed endpoint is flaky from datacenter IPs (random 404/500). Retry, then scrape."""
    last = None
    for attempt in range(3):
        try:
            r = requests.get(RSS.format(channel_id), headers=BROWSER_UA, timeout=20)
            last = r.status_code
            if r.status_code == 200 and b"<feed" in r.content[:600]:
                return _parse_feed(r.content)
        except Exception as e:
            last = "ERR %s" % type(e).__name__
        time.sleep(1.5 * (attempt + 1))
    title, vids = scrape_channel_videos(channel_id)
    if title is not None:
        return title, vids
    return None, last


_REL = {"second": 1, "minute": 60, "hour": 3600, "day": 86400, "week": 604800, "month": 2629800, "year": 31557600}
# YouTube now also uses short forms ("10mo ago", "1y ago", "3w ago").
_SHORT = {"s": "second", "sec": "second", "m": "minute", "min": "minute", "h": "hour", "hr": "hour",
          "d": "day", "w": "week", "wk": "week", "mo": "month", "y": "year", "yr": "year"}

def _relative_to_iso(txt):
    m = re.search(r"(\d+)\s*(second|minute|hour|day|week|month|year|mo|min|sec|hr|wk|yr|[smhdwy])s?\b", txt or "")
    if not m:
        return None
    unit = _SHORT.get(m.group(2), m.group(2))
    secs = int(m.group(1)) * _REL[unit]
    return datetime.fromtimestamp(time.time() - secs, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")


def _lockup_videos(html, limit=15):
    """Read videos from ytInitialData in YouTube's 2025+ layout (lockupViewModel blocks)."""
    m = re.search(r"var ytInitialData = (\{.*?\});</script>", html, re.S)
    if not m:
        return []
    try:
        data = json.loads(m.group(1))
    except ValueError:
        return []
    found, seen = [], set()

    def walk(o):
        if len(found) >= limit:
            return
        if isinstance(o, dict):
            lock = o.get("lockupViewModel")
            if isinstance(lock, dict) and lock.get("contentType") == "LOCKUP_CONTENT_TYPE_VIDEO":
                vid = lock.get("contentId")
                meta = lock.get("metadata", {}).get("lockupMetadataViewModel", {})
                title = (meta.get("title") or {}).get("content")
                ago = re.search(r'"content": "([^"]*ago)"', json.dumps(meta.get("metadata", {})))
                if vid and title and vid not in seen:
                    seen.add(vid)
                    found.append({"video_id": vid, "title": title[:300],
                                  "url": "https://www.youtube.com/watch?v=" + vid,
                                  "thumbnail_url": "https://i.ytimg.com/vi/%s/hqdefault.jpg" % vid,
                                  "published_at": _relative_to_iso(ago.group(1) if ago else None)})
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(data)
    return found


def scrape_channel_videos(channel_id):
    """Fallback: read the public /videos page (ytInitialData) for the newest uploads."""
    try:
        r = requests.get("https://www.youtube.com/channel/%s/videos?hl=en" % channel_id, headers=BROWSER_UA, timeout=25)
        if r.status_code != 200:
            return None, []
    except Exception:
        return None, []
    html = r.text
    tm = re.search(r'<meta property="og:title" content="([^"]*)"', html)
    title = tm.group(1) if tm else ""
    vids = _lockup_videos(html)
    if vids:
        return title, vids
    vids, seen = [], set()
    for chunk in html.split('"videoRenderer":{')[1:] + html.split('"richItemRenderer":{')[1:]:
        vm = re.match(r'"videoId":"([\w-]{11})"', chunk) or re.search(r'"videoId":"([\w-]{11})"', chunk[:200])
        if not vm or vm.group(1) in seen:
            continue
        vid = vm.group(1)
        tt = re.search(r'"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"', chunk) or re.search(r'"title":\{"accessibility".{0,400}?"simpleText":"((?:[^"\\]|\\.)*)"', chunk)
        pt = re.search(r'"publishedTimeText":\{"simpleText":"([^"]*)"', chunk)
        if not tt:
            continue
        seen.add(vid)
        vids.append({"video_id": vid, "title": json.loads('"' + tt.group(1) + '"')[:300],
                     "url": "https://www.youtube.com/watch?v=" + vid,
                     "thumbnail_url": "https://i.ytimg.com/vi/%s/hqdefault.jpg" % vid,
                     "published_at": _relative_to_iso(pt.group(1) if pt else None)})
        if len(vids) >= 15:
            break
    if not vids and '"videoId"' not in html:
        return (title or None), []
    return title, vids


# ── channel details (avatar, subscribers) from the public channel page ─────
_MULT = {"K": 1e3, "M": 1e6, "B": 1e9}

def _count(txt):
    """'14.5K' -> 14500, '1,234' -> 1234."""
    m = re.match(r"([\d.,]+)\s*([KMB]?)", txt or "")
    if not m:
        return None
    return int(round(float(m.group(1).replace(",", "")) * _MULT.get(m.group(2), 1)))


def fetch_channel_details(channel_id):
    try:
        r = requests.get("https://www.youtube.com/channel/%s?hl=en" % channel_id, headers=BROWSER_UA, timeout=25)
        if r.status_code != 200:
            return None
    except Exception:
        return None
    html = r.text
    out = {}
    img = re.search(r'<meta property="og:image" content="(https://yt3\.[^"]+)"', html)
    if img:
        out["avatar_url"] = re.sub(r"=s\d+-", "=s176-", img.group(1))
    subs = re.search(r'"([\d.,]+[KMB]?) subscribers?"', html)
    if subs:
        out["subscriber_text"] = subs.group(1)
        out["subscriber_count"] = _count(subs.group(1))
    # the header reads "<n> subscribers" then "<n> videos"; earlier "1 video" strings are playlists
    vids = re.search(r'"([\d.,]+[KMB]?) videos?"', html[subs.end():] if subs else html)
    if vids:
        out["total_videos"] = _count(vids.group(1))
    if out:
        out["details_at"] = datetime.now(timezone.utc).isoformat()
    return out or None


# ── Supabase REST ───────────────────────────────────────────────────────────
class Supa:
    def __init__(self, url, key):
        self.url = url.rstrip("/") + "/rest/v1/"
        self.h = {"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json"}

    def upsert(self, table, rows, on_conflict):
        if not rows:
            return
        h = {**self.h, "Prefer": "resolution=merge-duplicates,return=minimal"}
        for i in range(0, len(rows), 200):
            r = requests.post(self.url + table + "?on_conflict=" + on_conflict, headers=h,
                              data=json.dumps(rows[i:i + 200]), timeout=30)
            if r.status_code >= 300:
                raise RuntimeError("%s upsert failed %s: %s" % (table, r.status_code, r.text[:300]))

    def patch(self, table, match, row):
        r = requests.patch(self.url + table, headers={**self.h, "Prefer": "return=minimal"},
                           params=match, data=json.dumps(row), timeout=30)
        if r.status_code >= 300:
            raise RuntimeError("%s patch failed %s: %s" % (table, r.status_code, r.text[:300]))

    def select(self, table, params):
        r = requests.get(self.url + table, headers=self.h, params=params, timeout=30)
        r.raise_for_status()
        return r.json()


# ── discovery (optional) ────────────────────────────────────────────────────
def discover(api_key, known_ids, supa, dry):
    found = {}
    for q in DISCOVERY_QUERIES:
        try:
            r = requests.get("https://www.googleapis.com/youtube/v3/search", timeout=20, params={
                "part": "snippet", "type": "channel", "q": q, "maxResults": 25, "key": api_key})
            r.raise_for_status()
        except Exception as e:
            log("  ! discovery query failed", q, e)
            continue
        for it in r.json().get("items", []):
            cid = it["snippet"].get("channelId")
            if cid and cid not in known_ids and cid not in found:
                found[cid] = {"name": it["snippet"]["title"][:200],
                              "url": "https://www.youtube.com/channel/" + cid,
                              "channel_id": cid, "note": "found via search: " + q,
                              "source": "discovery", "status": "pending"}
        time.sleep(0.3)
    log("discovery: %d unknown channels" % len(found))
    if found and not dry:
        # ignore duplicates already in pending (unique index on lower(url))
        h = {**supa.h, "Prefer": "resolution=ignore-duplicates,return=minimal"}
        r = requests.post(supa.url + "youtube_channels_pending?on_conflict=url", headers=h,
                          data=json.dumps(list(found.values())), timeout=30)
        if r.status_code >= 300:
            log("  ! pending insert failed", r.status_code, r.text[:200])
    return found


def sync_channel_details(supa, channel_rows, force=False):
    """Avatar and subscriber count change slowly: refresh weekly (Sundays), or when missing."""
    try:
        have = {r["slug"]: r for r in supa.select("youtube_channels", {"select": "slug,avatar_url,details_at"})}
    except Exception as e:
        log("  ! details: cannot read channels (%s); is the 2026-10-10 migration applied?" % e)
        return
    sunday = datetime.now(timezone.utc).isoweekday() == 7
    done = 0
    for row in channel_rows:
        cur = have.get(row["slug"], {})
        if not row.get("channel_id") or not row.get("active", True):
            continue
        if not (force or sunday or not cur.get("avatar_url")):
            continue
        det = fetch_channel_details(row["channel_id"])
        if det:
            supa.patch("youtube_channels", {"slug": "eq." + row["slug"]}, det)
            done += 1
        time.sleep(0.6)
    log("channel details refreshed: %d" % done)


# ── main ────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="fetch feeds but do not write to Supabase")
    ap.add_argument("--details", action="store_true", help="refresh every channel's avatar and subscriber count now")
    args = ap.parse_args()

    with open(CHANNELS_FILE, encoding="utf-8") as f:
        cfg = json.load(f)
    channels = cfg["channels"]
    supa = None
    if not args.dry_run:
        url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            sys.exit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (use --dry-run to test)")
        supa = Supa(url, key)

    # 1+2. for each channel: make sure the id works (feed answers 200), else re-resolve from the page
    all_videos, channel_rows, feed_out, failures, changed = [], [], [], [], False
    seen_ids = {}
    for c in channels:
        row = {"slug": c["slug"], "channel_id": None, "name": c["name"], "url": c["url"],
               "language": c.get("language"), "category": c.get("category", "other"),
               "description": c.get("description"), "verified": bool(c.get("verified")),
               "active": c.get("active", True), "video_count": 0, "last_video_at": None, "thumbnail_url": None}
        if not row["active"]:
            channel_rows.append(row); continue
        cid, title, vids = c.get("channel_id"), None, []
        for attempt in (1, 2):
            if cid:
                try:
                    title, vids = fetch_feed(cid)
                except Exception as e:
                    title, vids = None, "ERR %s" % e
                if title is not None:
                    break
                log("  ! feed %s id=%s -> %s" % (c["slug"], cid, vids))
            if attempt == 1:
                new_id = resolve_channel_id(c["url"])
                if new_id and new_id != cid:
                    log("resolve", c["slug"], "->", new_id)
                    cid = new_id
                elif not new_id:
                    break
            time.sleep(0.5)
        if title is None:
            failures.append(c["slug"]); vids = []; cid = None if not c.get("channel_id") else c["channel_id"]
        if cid and cid in seen_ids:
            log("  ! %s resolves to the same channel as %s; skipping id" % (c["slug"], seen_ids[cid]))
            cid, vids = None, []
        if cid:
            seen_ids[cid] = c["slug"]
        if cid != c.get("channel_id"):
            c["channel_id"] = cid; changed = True
        row["channel_id"] = cid
        for v in vids:
            v["channel_slug"] = c["slug"]
        all_videos.extend(vids)
        row["video_count"] = len(vids)
        if vids:
            row["last_video_at"] = max(v["published_at"] or "" for v in vids) or None
            row["thumbnail_url"] = vids[0]["thumbnail_url"]
            feed_out.append({"slug": c["slug"], "name": c["name"], "latest": vids[:3]})
        channel_rows.append(row)
        time.sleep(0.4)
    log("channels: %d, videos: %d, feed failures: %s" % (len(channel_rows), len(all_videos), failures or "none"))
    if changed:
        with open(CHANNELS_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
            f.write("\n")

    # 3. write snapshot
    with open(FEED_FILE, "w", encoding="utf-8") as f:
        json.dump({"generated_at": datetime.now(timezone.utc).isoformat(), "channels": feed_out}, f,
                  ensure_ascii=False, indent=1)

    # 4. supabase
    if supa:
        supa.upsert("youtube_channels", channel_rows, "slug")
        # RSS rows carry a description; scraped rows do not, so upsert them apart (a bulk upsert
        # needs the same keys in every row, and must not blank out a description saved earlier)
        with_desc = [v for v in all_videos if "description" in v]
        without = [v for v in all_videos if "description" not in v]
        supa.upsert("youtube_videos", with_desc, "video_id")
        supa.upsert("youtube_videos", without, "video_id")
        log("supabase upsert ok")
        sync_channel_details(supa, channel_rows, force=args.details)

    # 5. discovery
    api_key = os.environ.get("YOUTUBE_API_KEY")
    if api_key:
        known = {c["channel_id"] for c in channels if c.get("channel_id")}
        discover(api_key, known, supa, args.dry_run)

    # a GitHub step summary, if we are in Actions
    summ = os.environ.get("GITHUB_STEP_SUMMARY")
    if summ:
        with open(summ, "a") as f:
            f.write("## YouTube sync\n\n- channels: %d\n- videos upserted: %d\n- feed failures: %s\n"
                    % (len(channel_rows), len(all_videos), ", ".join(failures) or "none"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
