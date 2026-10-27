#!/usr/bin/env python3
"""The Wallpapers page a digital card links to, with its downloads.

    python3 wallpaper_page.py <card.json> <wallpapers-dir> <out-dir> [--background ribbon] [--palette blue]

<wallpapers-dir> holds the six files per background that wallpapers.mjs writes.
Copies them into <out-dir>/files/, makes small previews in <out-dir>/thumbs/
(ffmpeg), and writes <out-dir>/index.html. No script on the page.
"""
import argparse, html, json, pathlib, shutil, subprocess, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_card as bc

NAMES = {'ribbon': 'Blue Ribbon', 'light-trails': 'Light Trails', 'liquid-glass': 'Liquid Glass',
         'glass-tower': 'Glass Tower', 'houston-skyline': 'Houston Skyline', 'curved-facade': 'Curved Facade'}
E = lambda s: html.escape(str(s), quote=True)
CSS = '''
h1.t{margin:26px 0 0;font:800 34px/1.05 var(--display)}
.sub{margin-top:8px;font:400 15px/1.5 var(--body);color:#dbe5f5;max-width:360px}
.list{width:100%;display:grid;gap:16px;margin-top:22px;text-align:left}
.wpcard{border-radius:22px;padding:14px;background:rgba(8,12,40,.55);box-shadow:inset 0 0 0 1px rgba(255,255,255,.2);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
.wpcard h2{margin:2px 4px 10px;font:800 18px var(--display)}
.pv{display:grid;grid-template-columns:76px 1fr;gap:10px;align-items:end}
.pv img{width:100%;display:block;border-radius:10px;box-shadow:0 10px 24px -12px rgba(0,0,0,.7)}
.grp{margin-top:12px;font:700 11px var(--body);letter-spacing:.16em;text-transform:uppercase;color:#cbd5e1}
.btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.btns a{display:inline-flex;align-items:center;gap:6px;padding:9px 13px;border-radius:999px;background:#fff;color:var(--ink);text-decoration:none;font:600 13.5px var(--body)}
.btns a.q{background:var(--acc);color:var(--acc-text)}
.btns svg{width:15px;height:15px;stroke:currentColor}
details{margin-top:18px;width:100%;text-align:left;border-radius:18px;padding:14px 16px;background:rgba(8,12,40,.55);box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}
summary{cursor:pointer;font:700 15px var(--body)}
details p{margin:10px 0 0;font:400 14px/1.55 var(--body);color:#dbe5f5}details b{color:#fff}
.back{margin:20px 0 28px;font:600 14px var(--body)}.back a{text-decoration:none}
'''
DL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>'

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('config'); ap.add_argument('wallpapers'); ap.add_argument('out')
    ap.add_argument('--background'); ap.add_argument('--palette'); ap.add_argument('--card-url', default='../')
    a = ap.parse_args(); c = json.loads(pathlib.Path(a.config).read_text())
    src = pathlib.Path(a.wallpapers); out = pathlib.Path(a.out); (out / 'files').mkdir(parents=True, exist_ok=True); (out / 'thumbs').mkdir(exist_ok=True)
    bgs = [n for n in NAMES if (src / f'{n}-phone-qr.jpg').exists()]
    if not bgs: sys.exit('no wallpapers found in ' + str(src))
    who = E(c['name']).replace(' ', '-').lower()
    cards = ''
    for n in bgs:
        files = {k: f'{n}-{k}.jpg' for k in ('phone-qr', 'phone', 'laptop', 'laptop-clean', 'desktop', 'desktop-clean')}
        for k, fn in files.items(): shutil.copy(src / fn, out / 'files' / fn)
        for k, w in (('phone-qr', 160), ('desktop', 420)):
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src / files[k]), '-vf', f'scale={w}:-2', '-q:v', '5', str(out / 'thumbs' / f'{n}-{k}.jpg')], check=True)
        d = lambda k, label, cls='': f'<a class="{cls}" href="files/{files[k]}" download="{who}-{files[k]}">{DL}{label}</a>'
        cards += f'''<section class="wpcard"><h2>{NAMES[n]}</h2>
<div class="pv"><img src="thumbs/{n}-phone-qr.jpg" alt="{NAMES[n]} phone wallpaper with QR code" loading="lazy"><img src="thumbs/{n}-desktop.jpg" alt="{NAMES[n]} desktop wallpaper" loading="lazy"></div>
<div class="grp">Phone</div><div class="btns">{d("phone-qr", "Lock screen with my QR", "q")}{d("phone", "Clean")}</div>
<div class="grp">Computer</div><div class="btns">{d("laptop", "Laptop")}{d("desktop", "Desktop")}{d("laptop-clean", "Laptop, clean")}{d("desktop-clean", "Desktop, clean")}</div></section>'''
    bg = a.background or c.get('background', 'ribbon'); pal = a.palette or c.get('palette', 'blue')
    stem = bc.BACKGROUNDS.get(bg, bg) + ('' if pal == 'blue' else f'-{pal}')
    tops = json.loads((bc.KIT / 'assets' / 'backgrounds' / 'tops.json').read_text())
    shutil.copy(bc.KIT / 'assets' / 'backgrounds' / f'{stem}.jpg', out / 'bg.jpg')
    fonts = c.get('fonts_url')
    if not fonts:
        (out / 'fonts').mkdir(exist_ok=True)
        for ff in ('hanken-grotesk-var-latin.woff2', 'inter-var-latin.woff2'): shutil.copy(bc.KIT / 'assets' / 'fonts' / ff, out / 'fonts' / ff)
        fonts = 'fonts'
    p = bc.PALETTES[pal]
    css = (bc.BASE.replace('FONTS', fonts.rstrip('/')).replace('BGURL', c.get('wallpapers_bg_url', 'bg.jpg')).replace('TOP', tops[stem])
           .replace('ACCTEXT', p['acc_text']).replace('ACC', p['acc']).replace('INK', p['ink'])) + CSS
    title = f'Wallpapers | {c["name"]}'
    page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{E(title)}</title><meta name="description" content="Phone, laptop and desktop wallpapers from {E(c["name"])}, {E(c.get("company",""))}.">
<meta name="robots" content="noindex"><meta name="theme-color" content="{tops[stem]}">{f'<link rel="icon" href="{E(c["favicon"])}">' if c.get("favicon") else ''}
<style>{css}</style></head><body><div class="page"><main class="content">{bc.logo_html(c)}
<h1 class="t">Wallpapers</h1>
<div class="sub">Backgrounds for your phone and computer. The lock screen with my QR code is the one to show at events: people scan it and my card opens.</div>
<div class="list">{cards}</div>
<details><summary>How to set a wallpaper</summary>
<p><b>iPhone:</b> tap a phone download, press and hold the picture, choose Save to Photos (or Add to Photos). Then Settings, Wallpaper, Add New Wallpaper, Photos.</p>
<p><b>Android:</b> tap a phone download, open it from Downloads or Photos, then use the menu and choose Set as wallpaper.</p>
<p><b>Mac:</b> download Laptop or Desktop, then System Settings, Wallpaper, Add Photo. Or right-click the file in Finder and choose Set Desktop Picture.</p>
<p><b>Windows:</b> download Desktop or Laptop, right-click the file and choose Set as desktop background.</p></details>
<div class="back"><a href="{E(a.card_url)}">Back to {E(c["name"])}'s card</a></div>
</main></div></body></html>
'''
    (out / 'index.html').write_text(page); print('built', out / 'index.html', 'backgrounds:', ', '.join(bgs))

if __name__ == '__main__':
    main()
