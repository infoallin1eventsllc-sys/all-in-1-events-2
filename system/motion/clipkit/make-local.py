#!/usr/bin/env python3
"""Rewrite sizzle-local.json so every font and photo is an inline data: URI.
The @clipkit/renderer harness runs from http://127.0.0.1, so file:// and
proxy-only remote URLs never load in this sandbox's headless Chromium."""
import base64, json, re, sys, pathlib
here = pathlib.Path(__file__).parent
src = json.load(open(here/'sizzle-local.json'))
def data_uri(p, mime):
    return 'data:%s;base64,%s' % (mime, base64.b64encode(open(p,'rb').read()).decode())
def fix(url):
    if not isinstance(url,str): return url
    m = re.search(r'/(fonts|images)/([\w.-]+)$', url)
    if not m: return url
    p = here/m.group(1)/m.group(2)
    mime = 'font/woff2' if p.suffix=='.woff2' else 'image/jpeg'
    return data_uri(p, mime)
def walk(e):
    if isinstance(e,dict):
        for k,v in list(e.items()):
            if k in ('src','source','url') and isinstance(v,str): e[k]=fix(v)
            else: walk(v)
    elif isinstance(e,list):
        for v in e: walk(v)
walk(src)
json.dump(src, open(here/'sizzle-inline.json','w'))
print('wrote sizzle-inline.json', pathlib.Path(here/'sizzle-inline.json').stat().st_size//1024, 'KB')
