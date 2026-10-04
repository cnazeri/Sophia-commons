#!/usr/bin/env python3
"""
Sophia Commons :: weekly link & resource checker
=================================================
Collects every outbound URL from
  * index.html and sophia_commons_v9.js (hand-curated links, books, podcasts)
  * automation/youtube_channels.json
  * Supabase directory_entries.website_url (public anon read, key parsed from index.html)
then HEAD/GETs each one (concurrently) and writes
  crawl_reports/link_report_<date>.md and .json

Exit code 0 always (the workflow decides whether to open an issue from the JSON).
Run locally:  python3 automation/link_check.py
"""
import json, os, re, sys, time
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse
import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "crawl_reports")
UA = {"User-Agent": "Mozilla/5.0 (compatible; SophiaCommonsLinkCheck/1.0; +https://sophiacommons.org)",
      "Accept": "text/html,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.8"}
TIMEOUT, WORKERS = 20, 12
# Sites that answer bots with 403/429/999 even though they are fine in a browser
SOFT_HOSTS = ("amazon.", "facebook.com", "instagram.com", "linkedin.com", "x.com", "twitter.com", "youtube.com")
SKIP_PREFIX = ("mailto:", "tel:", "javascript:", "#", "/", "data:")

URL_RE = re.compile(r"""https?://[^\s"'<>)\]]+""")


def read(p):
    with open(p, encoding="utf-8", errors="ignore") as f:
        return f.read()


def collect():
    urls = {}  # url -> source label

    def add(u, src):
        u = u.rstrip(".,;:").replace("&amp;", "&")
        if u.startswith(SKIP_PREFIX) or "supabase.co" in u or "googleapis.com" in u or "gstatic.com" in u:
            return
        if "sophiacommons.org" in u or "cdn.jsdelivr.net" in u or "googletagmanager" in u:
            return
        urls.setdefault(u, src)

    for fn in ("index.html", "sophia_commons_v9.js"):
        p = os.path.join(ROOT, fn)
        if os.path.exists(p):
            for m in URL_RE.findall(read(p)):
                add(m, fn)

    cj = os.path.join(ROOT, "automation", "youtube_channels.json")
    if os.path.exists(cj):
        for c in json.load(open(cj, encoding="utf-8"))["channels"]:
            add(c["url"], "youtube_channels.json")

    # Supabase directory (anon key is public by design; parse it from the shipped HTML)
    html = read(os.path.join(ROOT, "index.html")) if os.path.exists(os.path.join(ROOT, "index.html")) else ""
    mu = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", html)
    mk = re.search(r"SUPABASE_ANON_KEY\s*=\s*'([^']+)'", html)
    if mu and mk:
        try:
            r = requests.get(mu.group(1) + "/rest/v1/directory_entries", timeout=30,
                             params={"select": "name,website_url", "website_url": "not.is.null", "limit": "2000"},
                             headers={"apikey": mk.group(1), "Authorization": "Bearer " + mk.group(1)})
            r.raise_for_status()
            for row in r.json():
                if row.get("website_url", "").startswith("http"):
                    add(row["website_url"], "directory: " + (row.get("name") or "?"))
        except Exception as e:
            print("directory fetch skipped:", e)
    return urls


def check(url):
    host = urlparse(url).netloc.lower()
    soft = any(h in host for h in SOFT_HOSTS)
    t0 = time.time()
    try:
        r = requests.head(url, headers=UA, timeout=TIMEOUT, allow_redirects=True)
        if r.status_code in (403, 405, 404, 429, 500, 501, 503, 999):   # some servers reject HEAD
            r = requests.get(url, headers=UA, timeout=TIMEOUT, allow_redirects=True, stream=True)
            r.close()
        code, final = r.status_code, r.url
        ok = code < 400 or (soft and code in (403, 429, 999))
        return {"url": url, "status": code, "ok": ok, "final_url": final if final != url else None,
                "ms": int((time.time() - t0) * 1000), "soft": soft}
    except requests.exceptions.SSLError:
        return {"url": url, "status": "SSL", "ok": False, "ms": int((time.time() - t0) * 1000), "soft": soft}
    except requests.exceptions.Timeout:
        return {"url": url, "status": "TIMEOUT", "ok": soft, "ms": TIMEOUT * 1000, "soft": soft}
    except Exception as e:
        return {"url": url, "status": "ERR " + type(e).__name__, "ok": False, "ms": 0, "soft": soft}


def main():
    urls = collect()
    print("checking %d urls" % len(urls))
    results = []
    with ThreadPoolExecutor(WORKERS) as ex:
        futs = {ex.submit(check, u): u for u in urls}
        for i, f in enumerate(as_completed(futs), 1):
            res = f.result()
            res["source"] = urls[res["url"]]
            results.append(res)
            if i % 50 == 0:
                print("  %d/%d" % (i, len(urls)))
    results.sort(key=lambda r: (r["ok"], r["source"], r["url"]))
    broken = [r for r in results if not r["ok"]]
    redirected = [r for r in results if r["ok"] and r.get("final_url") and
                  urlparse(r["final_url"]).netloc != urlparse(r["url"]).netloc]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    os.makedirs(OUT_DIR, exist_ok=True)
    summary = {"date": today, "checked": len(results), "broken": len(broken), "redirected": len(redirected),
               "broken_links": broken, "redirects": redirected}
    with open(os.path.join(OUT_DIR, "link_report_%s.json" % today), "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=1)

    md = ["# Sophia Commons link report: %s" % today, "",
          "- Checked: **%d** links" % len(results),
          "- Broken: **%d**" % len(broken),
          "- Moved to another domain: **%d**" % len(redirected), ""]
    if broken:
        md += ["## Broken links", "", "| Status | Source | URL |", "|---|---|---|"]
        md += ["| %s | %s | %s |" % (r["status"], r["source"], r["url"]) for r in broken]
        md.append("")
    if redirected:
        md += ["## Moved (update the link)", "", "| Source | Old | New |", "|---|---|---|"]
        md += ["| %s | %s | %s |" % (r["source"], r["url"], r["final_url"]) for r in redirected]
        md.append("")
    if not broken and not redirected:
        md.append("All links healthy.")
    with open(os.path.join(OUT_DIR, "link_report_%s.md" % today), "w", encoding="utf-8") as f:
        f.write("\n".join(md) + "\n")
    with open(os.path.join(OUT_DIR, "link_report_latest.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=1)

    summ = os.environ.get("GITHUB_STEP_SUMMARY")
    if summ:
        with open(summ, "a") as f:
            f.write("\n".join(md) + "\n")
    print("broken: %d, moved: %d" % (len(broken), len(redirected)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
