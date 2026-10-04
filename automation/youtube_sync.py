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
    """Return the UC... id for a /@handle, /c/name, /user/name or /channel/UC... URL."""
    m = re.search(r"/channel/(UC[\w-]{22})", url)
    if m:
        return m.group(1)
    try:
        r = requests.get(url, headers={**UA, "Cookie": "CONSENT=YES+1"}, timeout=20)
        r.raise_for_status()
    except Exception as e:
        log("  ! could not fetch", url, e)
        return None
    for pat in (r'"channelId":"(UC[\w-]{22})"', r'<meta itemprop="identifier" content="(UC[\w-]{22})"',
                r'channel_id=(UC[\w-]{22})', r'"externalId":"(UC[\w-]{22})"'):
        m = re.search(pat, r.text)
        if m:
            return m.group(1)
    return None


# ── RSS ─────────────────────────────────────────────────────────────────────
def fetch_feed(channel_id):
    r = requests.get(RSS.format(channel_id), headers=UA, timeout=20)
    if r.status_code != 200:
        return None, []
    root = ET.fromstring(r.content)
    title = root.findtext("a:title", default="", namespaces=NS)
    videos = []
    for e in root.findall("a:entry", NS):
        vid = e.findtext("yt:videoId", default="", namespaces=NS)
        if not vid:
            continue
        thumb = e.find("media:group/media:thumbnail", NS)
        videos.append({
            "video_id": vid,
            "title": e.findtext("a:title", default="", namespaces=NS)[:300],
            "url": "https://www.youtube.com/watch?v=" + vid,
            "thumbnail_url": thumb.get("url") if thumb is not None else "https://i.ytimg.com/vi/%s/hqdefault.jpg" % vid,
            "published_at": e.findtext("a:published", default=None, namespaces=NS),
        })
    return title, videos


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


# ── main ────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="fetch feeds but do not write to Supabase")
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

    # 1. resolve ids, persist them back into the JSON so we only do this once
    changed = False
    for c in channels:
        if not c.get("channel_id"):
            cid = resolve_channel_id(c["url"])
            log("resolve", c["slug"], "->", cid)
            if cid:
                c["channel_id"] = cid
                changed = True
            time.sleep(0.5)
    if changed:
        with open(CHANNELS_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
            f.write("\n")

    # 2. feeds
    all_videos, channel_rows, feed_out, failures = [], [], [], []
    for c in channels:
        row = {k: c.get(k) for k in ("slug", "channel_id", "name", "url", "language", "category", "description")}
        row["verified"] = bool(c.get("verified"))
        row["active"] = c.get("active", True)
        if c.get("channel_id"):
            try:
                title, vids = fetch_feed(c["channel_id"])
            except Exception as e:
                title, vids = None, []
                log("  ! feed error", c["slug"], e)
            if title is None:
                failures.append(c["slug"])
            else:
                for v in vids:
                    v["channel_slug"] = c["slug"]
                all_videos.extend(vids)
                row["video_count"] = len(vids)
                if vids:
                    row["last_video_at"] = max(v["published_at"] or "" for v in vids) or None
                    row["thumbnail_url"] = vids[0]["thumbnail_url"]
                feed_out.append({"slug": c["slug"], "name": c["name"], "latest": vids[:3]})
            time.sleep(0.4)
        channel_rows.append(row)
    log("channels: %d, videos: %d, feed failures: %s" % (len(channel_rows), len(all_videos), failures or "none"))

    # 3. write snapshot
    with open(FEED_FILE, "w", encoding="utf-8") as f:
        json.dump({"generated_at": datetime.now(timezone.utc).isoformat(), "channels": feed_out}, f,
                  ensure_ascii=False, indent=1)

    # 4. supabase
    if supa:
        supa.upsert("youtube_channels", channel_rows, "slug")
        supa.upsert("youtube_videos", all_videos, "video_id")
        log("supabase upsert ok")

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
