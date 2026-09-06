#!/usr/bin/env python3
"""Replace the repeated s-photo element with six explicit image elements.
Clipkit only preloads the first repeat_data source of a repeated image, so
five of six tiles rendered blank. Usage: fix-photos.py in.json out.json [url_prefix]"""
import json, sys
inp, out = sys.argv[1], sys.argv[2]
prefix = sys.argv[3] if len(sys.argv) > 3 else None
d = json.load(open(inp))
def find_parent(e):
    if isinstance(e, dict):
        els = e.get('elements')
        if isinstance(els, list):
            for c in els:
                if isinstance(c, dict) and c.get('id') == 's-photo': return e
            for c in els:
                r = find_parent(c)
                if r: return r
    elif isinstance(e, list):
        for c in e:
            r = find_parent(c)
            if r: return r
parent = find_parent(d)
els = parent['elements']
idx = next(i for i, c in enumerate(els) if c.get('id') == 's-photo')
old = els[idx]
srcs = [r['src'] for r in old['repeat_data']]
if prefix:
    names = ['hoodie-charcoal','joggers','shell-jacket','hoodie-light','sneakers','cargo']
    srcs = [prefix + n + '.jpg' for n in names]
new = []
for i, src in enumerate(srcs):
    col, row = i % 3, i // 3
    new.append({
        "type": "image", "id": f"s-photo-{i}", "layer": 7 if i == 0 else 11 + i,
        "time": round(17.7 + 0.14 * i, 2), "duration": "end",
        "x": 52 + col * 400, "y": 100 + row * 300,
        "width": 336, "height": 172, "fit": "cover", "border_radius": 8,
        "source": src,
        "animations": [{"type": "fade-in", "time": "start", "duration": 0.35}],
    })
els[idx:idx+1] = new
json.dump(d, open(out, 'w'))
print('replaced s-photo with', len(new), 'elements ->', out)
