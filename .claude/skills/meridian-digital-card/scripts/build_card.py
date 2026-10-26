#!/usr/bin/env python3
"""Build a Meridian Interface digital business card from a JSON config.

    python3 build_card.py <card.json> <out_dir> [--layout 1-4] [--background ribbon] [--palette gold]

Writes <out_dir>/index.html, copies the background as bg.jpg and the two fonts
into <out_dir>/fonts/ (unless the config points fonts_url somewhere else).
No script on the page, so it runs under a strict security policy. Every value
in the config is HTML-escaped. See ../SKILL.md for the config fields.
"""
import argparse, html, json, pathlib, shutil, sys

KIT = pathlib.Path(__file__).resolve().parent.parent
BACKGROUNDS = {  # owned art, generated in Otis's Higgsfield account (job ids in SKILL.md)
    'ribbon': 'ribbon', 'light-trails': 'light-trails', 'liquid-glass': 'liquid-glass',
    'glass-tower': 'glass-tower', 'houston-skyline': 'houston-skyline', 'curved-facade': 'curved-facade',
}
# accent = the Book button; ink = text on the white buttons; top = page colour behind the art
PALETTES = {
    'blue':   {'acc': '#2563eb', 'acc_text': '#fff', 'ink': '#141a52'},
    'purple': {'acc': '#7c3aed', 'acc_text': '#fff', 'ink': '#2e1065'},
    'teal':   {'acc': '#0d9488', 'acc_text': '#fff', 'ink': '#042f2e'},
    'gold':   {'acc': '#d4a017', 'acc_text': '#1c1917', 'ink': '#1c1917'},
    'red':    {'acc': '#dc2626', 'acc_text': '#fff', 'ink': '#450a0a'},
    'sunset': {'acc': '#ea580c', 'acc_text': '#fff', 'ink': '#431407'},
}
ICON = {
    'phone': '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    'text': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    'mail': '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    'web': '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
    'cal': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    'add': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
}
def ic(n): return f'<svg viewBox="0 0 24 24" aria-hidden="true">{ICON[n]}</svg>'
E = lambda s: html.escape(str(s), quote=True)

BASE = '''
@font-face{font-family:"Hanken Grotesk";src:url(FONTS/hanken-grotesk-var-latin.woff2) format("woff2");font-weight:100 900;font-display:swap}
@font-face{font-family:"Inter";src:url(FONTS/inter-var-latin.woff2) format("woff2");font-weight:100 900;font-display:swap}
*{box-sizing:border-box}
:root{--display:"Hanken Grotesk","Helvetica Neue",Arial,sans-serif;--body:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--top:TOP;--acc:ACC;--acc-text:ACCTEXT;--ink:INK}
html{background:var(--top)}
body{margin:0;font-family:var(--body);font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased;
 min-height:100vh;min-height:100svh;display:flex;flex-direction:column;color:#fff;
 background:var(--top) url(BGURL) 50% 100%/cover no-repeat}
@media (max-aspect-ratio:3/4){body{background-position:50% 0;background-size:auto 112%}}
svg{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:2}
a{color:inherit}
a:focus-visible{outline:3px solid #fff;outline-offset:2px}
.page{flex:1;display:flex;flex-direction:column;width:100%;max-width:460px;margin:0 auto}
.content{padding:max(30px,env(safe-area-inset-top)) 18px 0;display:grid;justify-items:center;text-align:center}
.art{flex:1;min-height:clamp(240px,38vh,380px);position:relative;margin-top:18px}
.logo{display:flex;align-items:center;gap:12px}
.logo img{width:52px;height:auto;filter:drop-shadow(0 6px 18px rgba(0,0,0,.35))}
.logo img.full{width:auto;max-width:220px;max-height:90px}
.logo .wm{text-align:left}.logo b{display:block;font:800 21px/1 var(--display);letter-spacing:.2em}
.logo span{display:block;margin-top:6px;font:700 11.5px/1 var(--body);letter-spacing:.28em;color:#cbd5e1}
.logo b,.logo span,h1{text-shadow:0 2px 14px rgba(0,0,0,.55)}
'''
LAYOUT_CSS = {
1: '''
.logo{flex-direction:column;gap:12px}.logo img{width:78px}.logo .wm{text-align:center}.logo b{padding-left:.2em}.logo span{padding-left:.28em}
h1{margin:30px 0 0;font:800 36px/1.05 var(--display);letter-spacing:.01em}
.role{margin-top:10px;font:700 17px var(--body)}
.tag{margin-top:8px;font:400 14.5px/1.45 var(--body);color:#dbe5f5;max-width:330px}
.pills{width:100%;display:grid;gap:14px;margin-top:24px}
.pill{position:relative;display:flex;align-items:center;justify-content:center;min-height:52px;border-radius:999px;background:#fff;color:var(--ink);
 text-decoration:none;font:600 17px var(--body);box-shadow:0 10px 24px -10px rgba(0,0,0,.55)}
.pill svg{position:absolute;left:22px;width:20px;height:20px;stroke:var(--ink)}
.pill.book{background:var(--acc);color:var(--acc-text)}.pill.book svg{stroke:var(--acc-text)}
.dots{position:absolute;left:0;right:0;top:12%;display:flex;justify-content:center;gap:22px}
.dot{width:46px;height:46px;border-radius:50%;background:#fff;display:grid;place-items:center;box-shadow:0 6px 16px rgba(0,0,0,.35)}
.dot svg{width:21px;height:21px;stroke:var(--ink)}
''',
2: '''
.content{justify-items:start;text-align:left;padding-left:24px;padding-right:24px}
h1{margin:40px 0 0;font:800 44px/1 var(--display);letter-spacing:-.015em}
.role{margin-top:12px;font:700 12.5px var(--body);letter-spacing:.22em;text-transform:uppercase;color:#bfdbfe}
.tag{margin-top:14px;font:400 15px/1.5 var(--body);color:#dbe5f5;max-width:320px}
.btns{width:100%;display:grid;gap:10px;margin-top:26px}
.b{display:flex;align-items:center;gap:12px;min-height:54px;padding:0 18px;border-radius:16px;text-decoration:none;font:700 16px var(--body)}
.b svg{width:20px;height:20px;stroke:currentColor;flex:none}
.b.main{background:#fff;color:#0f172a;justify-content:center;font:800 17px var(--display)}
.row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.g{flex-direction:column;justify-content:center;gap:6px;min-height:70px;padding:0;font:600 13px var(--body);
 background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,.28);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.g svg{width:22px;height:22px}
.save{position:absolute;left:24px;right:24px;top:12%;display:flex;justify-content:center}
.save a{display:flex;align-items:center;gap:10px;padding:13px 22px;border-radius:999px;text-decoration:none;font:700 15px var(--body);
 background:rgba(0,0,0,.28);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.save svg{width:19px;height:19px;stroke:#fff}
''',
3: '''
.content{padding-top:max(24px,env(safe-area-inset-top))}
.logo img{width:40px}.logo b{font-size:17px}.logo span{font-size:9.5px;margin-top:5px}
h1{margin:22px 0 0;font:800 32px/1.05 var(--display)}
.role{margin-top:6px;font:600 15px var(--body);color:#dbe5f5}
.qr{margin-top:20px;background:#fff;border-radius:24px;padding:18px 18px 14px;box-shadow:0 24px 50px -20px rgba(0,0,0,.6);color:#0f172a}
.qr img{width:196px;height:196px;display:block}.qr p{margin:10px 0 0;font:600 13px var(--body);color:#475569}
.two{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}
.two a{display:flex;align-items:center;justify-content:center;gap:8px;min-height:52px;border-radius:14px;text-decoration:none;font:800 15.5px var(--display)}
.two svg{width:19px;height:19px;stroke:currentColor}
.w{background:#fff;color:#0f172a}.o{box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.6)}
.line{margin-top:14px;font:600 13.5px var(--body);color:#dbe5f5}.line a{text-decoration:none}
.art{margin-top:6px}
''',
4: '''
.content{padding-top:max(26px,env(safe-area-inset-top))}
.stack{position:relative;flex:1;display:flex;flex-direction:column}
.panel{position:relative;z-index:1;margin:26px 16px 0;padding:22px 20px 20px;border-radius:26px;text-align:left;
 background:rgba(8,12,40,.5);box-shadow:inset 0 0 0 1px rgba(255,255,255,.22),0 30px 60px -30px rgba(0,0,0,.7);-webkit-backdrop-filter:blur(14px) saturate(1.2);backdrop-filter:blur(14px) saturate(1.2)}
.panel h1{margin:0;font:800 32px/1.05 var(--display)}
.panel .role{margin-top:6px;font:600 15px var(--body);color:#dbe5f5}
.panel .tag{margin-top:10px;font:400 14px/1.5 var(--body);color:#dbe5f5}
.list{margin-top:16px;display:grid;border-top:1px solid rgba(255,255,255,.18)}
.list a{display:grid;grid-template-columns:22px 1fr auto;align-items:center;gap:12px;padding:12px 2px;border-bottom:1px solid rgba(255,255,255,.18);text-decoration:none;font:600 15px var(--body)}
.list span{min-width:0;overflow-wrap:anywhere}
.list svg{width:19px;height:19px;stroke:#dbe5f5}.list small{color:#dbe5f5;font:500 12px var(--body)}
.cta{margin-top:16px;display:grid;gap:10px}
.cta a{display:flex;align-items:center;justify-content:center;gap:10px;min-height:54px;border-radius:15px;text-decoration:none;font:800 16.5px var(--display)}
.cta svg{width:20px;height:20px;stroke:currentColor}
.cta .w{background:#fff;color:#0f172a}.cta .o{box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.5)}
.spacer{flex:1;min-height:150px}
''',
}

def logo_html(c):
    lg = c.get('logo', {})
    if lg.get('image'):  # a client's full logo file: must read on a dark ground (light version or on a plate)
        return f'<div class="logo"><img class="full" src="{E(lg["image"])}" alt="{E(c.get("company",""))}"></div>'
    return (f'<div class="logo"><img src="{E(lg["mark"])}" alt="" width="342" height="333">'
            f'<div class="wm" aria-label="{E(c.get("company",""))}"><b>{E(lg.get("line1",""))}</b><span>{E(lg.get("line2",""))}</span></div></div>')

def build(c, layout):
    n = E(c['name']); role = E(c['role']); tag = E(c.get('tagline', ''))
    tel = 'tel:' + E(c['phone']); sms = 'sms:' + E(c['phone']); mail = 'mailto:' + E(c['email'])
    web = E(c['website']); book = E(c['booking_url']); vcf = E(c['vcard_url'])
    dl = f'download="{n}.vcf"'; first = E(c['name'].split()[0])
    LOGO = logo_html(c)
    if layout == 1:
        return f'''<header class="content">{LOGO}<h1>{n}</h1><div class="role">{role}</div>
<div class="tag">{tag}</div>
<nav class="pills" aria-label="Contact {n}"><a class="pill" href="{tel}">{ic("phone")}Call</a><a class="pill" href="{mail}">{ic("mail")}Email</a><a class="pill book" href="{book}">{ic("cal")}{E(c.get("booking_label","Book a 1-on-1 appointment"))}</a></nav></header>
<div class="art"><div class="dots"><a class="dot" href="{sms}" aria-label="Text {first}">{ic("text")}</a><a class="dot" href="{web}" aria-label="Website">{ic("web")}</a><a class="dot" href="{vcf}" {dl} aria-label="Save to contacts">{ic("add")}</a></div></div>'''
    if layout == 2:
        first_last = n.replace(' ', '<br>', 1)
        return f'''<header class="content">{LOGO}<h1>{first_last}</h1><div class="role">{role}</div>
<div class="tag">{E(c.get("tagline_long", c.get("tagline","")))}</div>
<nav class="btns" aria-label="Contact {n}"><a class="b main" href="{book}">{ic("cal")}{E(c.get("booking_label_long","Book your 1-on-1 appointment"))}</a>
<div class="row"><a class="b g" href="{tel}">{ic("phone")}Call</a><a class="b g" href="{sms}">{ic("text")}Text</a><a class="b g" href="{mail}">{ic("mail")}Email</a></div></nav></header>
<div class="art"><div class="save"><a href="{vcf}" {dl}>{ic("add")}Save to contacts</a></div></div>'''
    if layout == 3:
        return f'''<header class="content">{LOGO}<h1>{n}</h1><div class="role">{role}</div>
<div class="qr"><img src="{E(c["qr"])}" alt="QR code that opens this card" width="196" height="196"><p>Scan with your phone camera</p></div>
<div class="two"><a class="w" href="{vcf}" {dl}>{ic("add")}Save contact</a><a class="o" href="{book}">{ic("cal")}Book a call</a></div>
<div class="line"><a href="{tel}">{E(c["phone_display"])}</a> · <a href="{web}">{E(c["website_display"])}</a></div></header>
<div class="art"></div>'''
    rows = ''.join(f'<a href="{h}">{ic(i)}<span>{E(t)}</span><small>{s}</small></a>' for h, i, t, s in [
        (tel, 'phone', c['phone_display'], 'Call'), (sms, 'text', c['phone_display'], 'Text'),
        (mail, 'mail', c['email'], 'Email'), (web, 'web', c['website_display'], 'Visit')])
    loc = f' · {E(c["location"])}' if c.get('location') else ''
    return f'''<header class="content">{LOGO}</header><div class="stack">
<section class="panel"><h1>{n}</h1><div class="role">{role}{loc}</div>
<div class="tag">{E(c.get("services_line", ""))}</div><nav class="list" aria-label="Contact {n}">{rows}</nav>
<div class="cta"><a class="w" href="{book}">{ic("cal")}{E(c.get("booking_label_long","Book your 1-on-1 appointment"))}</a><a class="o" href="{vcf}" {dl}>{ic("add")}Save to contacts</a></div></section><div class="spacer"></div></div>'''

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('config'); ap.add_argument('out')
    ap.add_argument('--layout', type=int); ap.add_argument('--background'); ap.add_argument('--palette')
    a = ap.parse_args()
    c = json.loads(pathlib.Path(a.config).read_text())
    layout = a.layout or c.get('layout', 1); bg = a.background or c.get('background', 'ribbon'); pal = a.palette or c.get('palette', 'blue')
    if layout not in LAYOUT_CSS: sys.exit('layout must be 1-4')
    if pal not in PALETTES: sys.exit('palette must be one of ' + ', '.join(PALETTES))
    stem = BACKGROUNDS.get(bg, bg) + ('' if pal == 'blue' else f'-{pal}')
    src = KIT / 'assets' / 'backgrounds' / f'{stem}.jpg'
    if not src.exists(): sys.exit(f'no background {src.name}; recolor it first with scripts/recolor.py')
    tops = json.loads((KIT / 'assets' / 'backgrounds' / 'tops.json').read_text())
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    shutil.copy(src, out / 'bg.jpg')
    fonts = c.get('fonts_url')
    if not fonts:
        (out / 'fonts').mkdir(exist_ok=True)
        for f in ('hanken-grotesk-var-latin.woff2', 'inter-var-latin.woff2'): shutil.copy(KIT / 'assets' / 'fonts' / f, out / 'fonts' / f)
        fonts = 'fonts'
    p = PALETTES[pal]
    css = (BASE.replace('FONTS', fonts.rstrip('/')).replace('BGURL', c.get('bg_url', 'bg.jpg')).replace('TOP', tops[stem])
           .replace('ACCTEXT', p['acc_text']).replace('ACC', p['acc']).replace('INK', p['ink'])) + LAYOUT_CSS[layout]
    title = f'{c["name"]} | {c.get("company","")}'.strip(' |')
    canon = f'<link rel="canonical" href="{E(c["canonical"])}">' if c.get('canonical') else ''
    og = ''.join(f'<meta property="og:{k}" content="{E(v)}">' for k, v in [('type', 'profile'), ('title', title), ('description', c.get('description', '')), ('url', c.get('canonical', '')), ('image', c.get('og_image', ''))] if v)
    page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{E(title)}</title><meta name="description" content="{E(c.get("description",""))}">{canon}{og}
<meta name="theme-color" content="{tops[stem]}">{f'<link rel="icon" href="{E(c["favicon"])}">' if c.get("favicon") else ''}
<style>{css}</style></head><body><div class="page">{build(c, layout)}</div></body></html>
'''
    (out / 'index.html').write_text(page)
    print(f'built {out}/index.html  layout {layout}, background {stem}, palette {pal}')

if __name__ == '__main__':
    main()
