#!/usr/bin/env python3
"""Read everything a public TikTok video carries.

Prints the author, duration, stats, caption, the English auto-captions,
every comment (the creator's own comment usually holds the link), and saves
the MP4 to /tmp/video.mp4 for frames_ocr.sh.

This sandbox cannot reach tiktok.com, so run it on Composio's cloud machine
(COMPOSIO_REMOTE_BASH_TOOL), which resets between sessions:

    cat > /tmp/tiktok_read.py <<'EOF'
    ...this file...
    EOF
    python3 /tmp/tiktok_read.py "https://www.tiktok.com/@user/video/123"

Public content only. Short links (vm.tiktok.com, tiktok.com/t/) are not
accepted: paste the full /@user/video/<id> URL.
"""
import http.cookiejar
import json
import re
import sys
import urllib.request

url = sys.argv[1].split("?")[0]
m = re.search(r"tiktok\.com/(@[^/]+)/video/(\d+)", url)
if not m:
    sys.exit("need a full https://www.tiktok.com/@user/video/<id> URL")
user, vid = m.group(1), m.group(2)

cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/141.0 Safari/537.36")
page = f"https://www.tiktok.com/{user}/video/{vid}"


def get(u, referer=None, timeout=30):
    h = {"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"}
    if referer:
        h["Referer"] = referer
    return op.open(urllib.request.Request(u, headers=h), timeout=timeout).read()


html = get(page).decode("utf-8", "ignore")
blob = re.search(r'id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', html, re.S)
if not blob:
    sys.exit("no page data: the video may be private, removed or age-gated")
detail = json.loads(blob.group(1))["__DEFAULT_SCOPE__"].get("webapp.video-detail", {})
item = detail.get("itemInfo", {}).get("itemStruct", {})
if not item:
    sys.exit(f"no video: statusCode={detail.get('statusCode')} {detail.get('statusMsg')}")
video = item.get("video", {})

print("AUTHOR:", item.get("author", {}).get("uniqueId"),
      "| DURATION:", video.get("duration"), "| STATS:", item.get("stats"))
print("CAPTION:", item.get("desc"))

for sub in video.get("subtitleInfos") or []:
    if str(sub.get("LanguageCodeName", "")).startswith("eng"):
        vtt = get(sub["Url"], referer="https://www.tiktok.com/").decode("utf-8", "ignore")
        lines = [l for l in vtt.splitlines() if l and "-->" not in l and l != "WEBVTT"]
        print("TRANSCRIPT:", " ".join(lines))
        break
else:
    print("TRANSCRIPT: none (no English auto-captions)")

try:
    api = f"https://www.tiktok.com/api/comment/list/?aid=1988&aweme_id={vid}&count=30&cursor=0"
    comments = json.loads(get(api, referer=page).decode("utf-8", "ignore"))
    for c in comments.get("comments") or []:
        print("COMMENT", c.get("user", {}).get("unique_id"), "|", (c.get("text") or "")[:300])
        for r in c.get("reply_comment") or []:
            print("   REPLY", r.get("user", {}).get("unique_id"), "|", (r.get("text") or "")[:300])
    print("COMMENTS TOTAL:", comments.get("total"))
except Exception as e:  # comments are a bonus, not the point
    print("COMMENTS: could not read:", e)

play = video.get("playAddr") or video.get("downloadAddr")
if play:
    data = get(play, referer="https://www.tiktok.com/", timeout=60)
    open("/tmp/video.mp4", "wb").write(data)
    print("VIDEO: saved /tmp/video.mp4", len(data), "bytes",
          video.get("width"), "x", video.get("height"))
else:
    print("VIDEO: no play URL")
