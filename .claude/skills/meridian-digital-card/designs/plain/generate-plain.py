import sys, pathlib
L = pathlib.Path(sys.argv[1]); common = (L/'common.css').read_text()
I = {
 'phone':'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
 'text':'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
 'mail':'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
 'web':'<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
 'cal':'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
 'add':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
 'pin':'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
 'arrow':'<path d="M5 12h14M13 6l6 6-6 6"/>',
}
def ic(n, c=''): return f'<svg viewBox="0 0 24 24" aria-hidden="true" class="{c}">{I[n]}</svg>'
TEL='tel:+12818829198'; SMS='sms:+12818829198'; MAIL='mailto:otis@meridianinterface.com'; BOOK='/?book=web_design'; VCF='/card/otis-williams.vcf'
def page(title, css, body, bg):
  return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Otis Williams | Meridian Interface</title><meta name="theme-color" content="{bg}"><link rel="icon" href="/brand/meridian-mark.png">
<style>{common}{css}</style></head><body>{body}</body></html>'''
quick = lambda cls: ''.join(f'<a class="{cls}" href="{h}">{ic(i)}<span>{t}</span></a>' for h,i,t in [(TEL,'phone','Call'),(SMS,'text','Text'),(MAIL,'mail','Email'),('/','web','Website')])

# ---------- A: Daylight (light, faithful lockup) ----------
A_css = '''
html{background:#eef2f8}body{background:#eef2f8;color:#0f172a;padding:max(20px,env(safe-area-inset-top)) 16px max(28px,env(safe-area-inset-bottom));display:flex;justify-content:center}
.card{width:100%;max-width:420px;background:#fff;border-radius:28px;box-shadow:0 1px 0 #e2e8f0,0 24px 60px -28px rgba(15,23,42,.35);overflow:hidden;align-self:flex-start}
.top{padding:30px 24px 8px;display:grid;justify-items:center;text-align:center}
.top img{width:200px;height:auto;display:block}
.rule{width:44px;height:3px;border-radius:3px;background:#2563eb;margin:22px auto 18px}
h1{margin:0;font:800 32px/1.1 var(--display);letter-spacing:-.01em}
.role{margin-top:6px;font-weight:600;color:#2563eb}
.what{margin-top:6px;color:#475569;font-size:13.5px;max-width:300px}.what span{white-space:nowrap}
.body{padding:22px 20px 24px;display:grid;gap:12px}
.quick{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.q{display:grid;justify-items:center;gap:6px;padding:13px 4px 11px;border-radius:16px;background:#f7f9fd;box-shadow:inset 0 0 0 1px #e2e8f0;text-decoration:none;font-size:12px;font-weight:600}
.q svg{width:22px;height:22px;stroke:#2563eb;stroke-width:2}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;min-height:54px;border-radius:14px;text-decoration:none;font:800 17px var(--display)}
.btn svg{width:20px;height:20px;stroke:currentColor;stroke-width:2}
.primary{background:#2563eb;color:#fff}.ghost{box-shadow:inset 0 0 0 1.5px #cbd5e1;color:#0f172a}
.rows{margin-top:6px;border-top:1px solid #e2e8f0}
.row{display:grid;grid-template-columns:20px 1fr;gap:14px;align-items:center;padding:12px 2px;border-bottom:1px solid #e2e8f0}
.row svg{width:18px;height:18px;stroke:#64748b;stroke-width:2}.row small{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#64748b}
.qr{display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:center;padding:14px;border-radius:16px;background:#f7f9fd;box-shadow:inset 0 0 0 1px #e2e8f0;margin-top:4px}
.qr img{width:92px;height:92px;display:block}.qr p{margin:0;font-size:13px;color:#475569}.qr b{display:block;color:#0f172a;font:800 15px var(--display);margin-bottom:2px}
'''
A_body = f'''<main class="card"><header class="top"><img src="/brand/meridian-lockup.png" alt="Meridian Interface" width="885" height="550">
<div class="rule"></div><h1>Otis Williams</h1><div class="role">Web Designer &amp; Developer</div><div class="what"><span>Websites</span> · <span>Online stores</span> · <span>Booking</span> · <span>CRM</span> · <span>Video ads</span></div></header>
<div class="body"><nav class="quick" aria-label="Contact Otis Williams">{quick("q")}</nav>
<a class="btn primary" href="{BOOK}">{ic("cal")}Book your 1-on-1 appointment</a><a class="btn ghost" href="{VCF}" download="Otis Williams.vcf">{ic("add")}Save to contacts</a>
<div class="rows"><div class="row">{ic("phone")}<div><small>Phone</small>281-882-9198</div></div><div class="row">{ic("mail")}<div><small>Email</small>otis@meridianinterface.com</div></div><div class="row">{ic("web")}<div><small>Website</small>meridianinterface.com</div></div><div class="row">{ic("pin")}<div><small>Based in</small>Houston, Texas</div></div></div>
<div class="qr"><img src="/card/qr.svg" alt="QR code that opens this card" width="92" height="92"><p><b>Scan to open this card</b>Point a phone camera here to open it.</p></div></div></main>'''

# ---------- B: Meridian Line (dark, vertical line motif) ----------
B_css = '''
html{background:#0a1020}body{background:#0a1020;color:#f8fafc;min-height:100vh}
.wrap{max-width:440px;margin:0 auto;padding-bottom:max(28px,env(safe-area-inset-bottom))}
.hero{position:relative;padding:max(40px,env(safe-area-inset-top)) 24px 34px;text-align:center;overflow:hidden;isolation:isolate;background:linear-gradient(90deg,#141d33 0 50%,#171b24 50% 100%)}
.hero::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:2px;transform:translateX(-50%);background:linear-gradient(#e2e8f0,rgba(226,232,240,.08) 85%);z-index:-1}
.hero::after{content:"";position:absolute;inset:auto 0 0 0;height:90px;background:linear-gradient(transparent,#0a1020);z-index:-1}
.mark{width:92px;height:auto;display:block;margin:0 auto;filter:drop-shadow(0 10px 30px rgba(0,0,0,.6))}
.wm{margin-top:18px;display:inline-block;background:#0a1020;padding:8px 14px;border-radius:10px}
.wm b{display:block;font:800 22px/1 var(--display);letter-spacing:.2em;padding-left:.2em}.wm span{display:block;margin-top:7px;font:700 12px/1 var(--body);letter-spacing:.28em;color:#cbd5e1;padding-left:.28em}
h1{margin:34px 0 0;font:800 42px/1 var(--display);letter-spacing:-.015em}
.role{margin-top:12px;font:700 12px var(--body);letter-spacing:.24em;text-transform:uppercase;color:#cbd5e1}
.body{padding:6px 18px 0;display:grid;gap:12px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.t{display:flex;align-items:center;gap:12px;padding:16px;border-radius:18px;text-decoration:none;font:700 15px var(--body);background:#141d33;box-shadow:inset 0 0 0 1px rgba(148,163,184,.18)}
.t:nth-child(even){background:#171b24}
.t svg{width:22px;height:22px;stroke:#93c5fd;stroke-width:2;flex:none}
.t small{display:block;font:500 11.5px var(--body);color:#94a3b8;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.t div{min-width:0}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;min-height:56px;border-radius:16px;text-decoration:none;font:800 17px var(--display)}
.btn svg{width:20px;height:20px;stroke:currentColor;stroke-width:2}
.primary{background:#f8fafc;color:#0f172a}.ghost{box-shadow:inset 0 0 0 1.5px rgba(203,213,225,.4)}
.svc{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:6px}
.svc span{font:600 12.5px var(--body);color:#cbd5e1;padding:7px 12px;border-radius:999px;box-shadow:inset 0 0 0 1px rgba(148,163,184,.25)}
.qr{display:flex;gap:14px;align-items:center;margin-top:6px;padding:14px;border-radius:18px;background:#111a2e;box-shadow:inset 0 0 0 1px rgba(148,163,184,.18)}
.qr i{background:#fff;padding:7px;border-radius:10px;line-height:0}.qr img{width:84px;height:84px}
.qr p{margin:0;font-size:13px;color:#cbd5e1}.qr b{display:block;color:#fff;font:800 15px var(--display)}
.foot{text-align:center;color:#64748b;font-size:12px;margin-top:8px;letter-spacing:.06em}
'''
tiles = ''.join(f'<a class="t" href="{h}">{ic(i)}<div>{t}<small>{s}</small></div></a>' for h,i,t,s in [(TEL,'phone','Call','281-882-9198'),(SMS,'text','Text','281-882-9198'),(MAIL,'mail','Email','otis@meridianinterface.com'),('/','web','Website','meridianinterface.com')])
B_body = f'''<div class="wrap"><header class="hero"><img class="mark" src="/brand/meridian-mark.png" alt="" width="342" height="333">
<div class="wm" aria-label="Meridian Interface"><b>MERIDIAN</b><span>INTERFACE</span></div>
<h1>Otis Williams</h1><div class="role">Web Designer &amp; Developer</div></header>
<div class="body"><nav class="grid" aria-label="Contact Otis Williams">{tiles}</nav>
<a class="btn primary" href="{BOOK}">{ic("cal")}Book your 1-on-1 appointment</a><a class="btn ghost" href="{VCF}" download="Otis Williams.vcf">{ic("add")}Save to contacts</a>
<div class="svc"><span>Websites</span><span>Online stores</span><span>Booking systems</span><span>CRM</span><span>Video ads</span></div>
<div class="qr"><i><img src="/card/qr.svg" alt="QR code that opens this card" width="84" height="84"></i><p><b>Scan to open this card</b>Show this screen so anyone can open it.</p></div>
<div class="foot">Houston, Texas · meridianinterface.com</div></div></div>'''

# ---------- C: Wallet Pass (QR-first, for showing in person) ----------
C_css = '''
html{background:#dfe5ee}body{background:linear-gradient(#e8edf4,#d6dde8);color:#0f172a;min-height:100vh;padding:max(22px,env(safe-area-inset-top)) 16px max(28px,env(safe-area-inset-bottom));display:flex;justify-content:center}
.col{width:100%;max-width:400px;display:grid;gap:14px;align-self:flex-start}
.pass{border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 30px 60px -30px rgba(15,23,42,.5),0 0 0 1px rgba(15,23,42,.06)}
.strip{background:#0f172a;color:#f8fafc;display:flex;align-items:center;gap:12px;padding:16px 18px}
.strip img{width:40px;height:auto}.strip .wm b{display:block;font:800 15px/1 var(--display);letter-spacing:.2em}.strip .wm span{display:block;margin-top:5px;font:700 9.5px/1 var(--body);letter-spacing:.28em;color:#cbd5e1}
.strip .tag{margin-left:auto;font:700 10px var(--body);letter-spacing:.2em;color:#93c5fd;text-transform:uppercase;text-align:right}
.main{padding:20px 20px 6px}
.lbl{font:700 10.5px var(--body);letter-spacing:.16em;text-transform:uppercase;color:#64748b}
.name{font:800 30px/1.1 var(--display);letter-spacing:-.01em;margin-top:4px}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:14px 16px;padding:16px 20px 18px}
.fields .v{font:600 14.5px/1.3 var(--body);margin-top:3px;overflow-wrap:normal}
.fields .wide{grid-column:1/-1}
.perf{height:22px;position:relative;margin:0 -1px}
.perf::before{content:"";position:absolute;left:18px;right:18px;top:50%;border-top:2px dashed #cbd5e1}
.perf::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 0 50%,#dfe5ee 10px,transparent 11px),radial-gradient(circle at 100% 50%,#dfe5ee 10px,transparent 11px)}
.code{display:grid;justify-items:center;padding:12px 20px 22px;text-align:center}
.code img{width:210px;height:210px;display:block}
.code p{margin:10px 0 0;font:600 13px var(--body);color:#475569}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;min-height:54px;border-radius:14px;text-decoration:none;font:800 17px var(--display)}
.btn svg{width:20px;height:20px;stroke:currentColor;stroke-width:2}
.ink{background:#0f172a;color:#fff}.primary{background:#2563eb;color:#fff}
.quick{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.q{display:grid;justify-items:center;gap:5px;padding:12px 4px 10px;border-radius:14px;background:rgba(255,255,255,.75);text-decoration:none;font:600 12px var(--body);box-shadow:0 0 0 1px rgba(15,23,42,.06)}
.q svg{width:21px;height:21px;stroke:#0f172a;stroke-width:2}
'''
C_body = f'''<main class="col"><section class="pass" aria-label="Business card"><div class="strip"><img src="/brand/meridian-mark.png" alt="" width="342" height="333"><div class="wm" aria-label="Meridian Interface"><b>MERIDIAN</b><span>INTERFACE</span></div><div class="tag">Business<br>card</div></div>
<div class="main"><div class="lbl">Name</div><div class="name">Otis Williams</div></div>
<div class="fields"><div class="wide"><div class="lbl">Role</div><div class="v">Web Designer &amp; Developer</div></div>
<div><div class="lbl">Phone</div><div class="v">281-882-9198</div></div><div><div class="lbl">Based in</div><div class="v">Houston, TX</div></div>
<div class="wide"><div class="lbl">Website</div><div class="v">meridianinterface.com</div></div>
<div class="wide"><div class="lbl">Email</div><div class="v">otis@meridianinterface.com</div></div></div>
<div class="perf"></div><div class="code"><img src="/card/qr.svg" alt="QR code that opens this card" width="210" height="210"><p>Scan with your phone camera to open my card</p></div></section>
<a class="btn ink" href="{VCF}" download="Otis Williams.vcf">{ic("add")}Save to contacts</a><a class="btn primary" href="{BOOK}">{ic("cal")}Book your 1-on-1 appointment</a>
<nav class="quick" aria-label="Contact Otis Williams">{quick("q")}</nav></main>'''

# ---------- D: Studio (bold statement + recent work) ----------
D_css = '''
html{background:#0f172a}body{background:#0f172a;color:#f8fafc;min-height:100vh}
.wrap{max-width:440px;margin:0 auto;padding:max(22px,env(safe-area-inset-top)) 18px max(30px,env(safe-area-inset-bottom))}
.top{display:flex;align-items:center;gap:10px}.top img{width:34px;height:auto}
.top b{font:800 14px/1 var(--display);letter-spacing:.2em}.top span{display:block;margin-top:4px;font:700 9px/1 var(--body);letter-spacing:.28em;color:#cbd5e1}
.top a{margin-left:auto;font:700 12px var(--body);color:#93c5fd;text-decoration:none;letter-spacing:.04em}
.state{margin:34px 0 0;font:800 44px/1.02 var(--display);letter-spacing:-.025em}
.state em{font-style:normal;color:#60a5fa}
.who{margin-top:22px;display:flex;align-items:center;gap:14px;padding-top:18px;border-top:1px solid rgba(148,163,184,.22)}
.av{width:56px;height:56px;border-radius:16px;background:#f8fafc;display:grid;place-items:center;flex:none}.av img{width:40px;height:auto}
.who h1{margin:0;font:800 22px/1.15 var(--display)}.who p{margin:2px 0 0;color:#cbd5e1;font-size:13.5px}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;min-height:56px;border-radius:16px;text-decoration:none;font:800 17px var(--display);margin-top:20px}
.btn svg{width:20px;height:20px;stroke:currentColor;stroke-width:2}
.primary{background:#2563eb;color:#fff}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
.row2 a{display:flex;align-items:center;justify-content:center;gap:8px;min-height:50px;border-radius:14px;text-decoration:none;font:700 14.5px var(--body);box-shadow:inset 0 0 0 1.5px rgba(203,213,225,.35)}
.row2 svg{width:18px;height:18px;stroke:#93c5fd;stroke-width:2}
h2{margin:30px 0 12px;font:700 11px var(--body);letter-spacing:.22em;text-transform:uppercase;color:#94a3b8}
.svc{display:grid;gap:8px}
.svc div{display:flex;justify-content:space-between;align-items:center;padding:13px 16px;border-radius:14px;background:#16213b;font:700 15px var(--body)}
.svc small{font:500 12px var(--body);color:#94a3b8}
.work{display:grid;gap:10px}
.work a{display:grid;grid-template-columns:132px 1fr auto;gap:14px;align-items:center;text-decoration:none;padding:8px;border-radius:16px;background:#16213b}.work img{width:132px;aspect-ratio:16/10;object-fit:cover;border-radius:10px;display:block}.work a>svg{width:18px;height:18px;stroke:#93c5fd;stroke-width:2;margin-right:6px}
.work b{display:block;font:700 15px var(--body)}.work small{display:block;color:#94a3b8;font-size:12.5px;margin-top:2px}
.qr{display:flex;gap:14px;align-items:center;margin-top:26px;padding:14px;border-radius:16px;background:#16213b}
.qr i{background:#fff;padding:7px;border-radius:10px;line-height:0}.qr img{width:76px;height:76px}.qr p{margin:0;font-size:13px;color:#cbd5e1}.qr b{display:block;color:#fff;font:800 15px var(--display)}
'''
work = ''.join(f'<a href="{h}"><img src="/images/portfolio/{img}" alt="" loading="lazy"><div><b>{t}</b><small>{d}</small></div>{ic("arrow")}</a>' for h,img,t,d in [('/demos/big-boy-subs/','big-boy-subs.jpg','Ordering app','Big Boy Subs'),('/demos/frame-shop/','frame-shop.jpg','Booking website','Frame shop'),('/demos/meridian-crm/','meridian-crm.jpg','Business CRM','Meridian CRM')])
D_body = f'''<main class="wrap"><div class="top"><img src="/brand/meridian-mark.png" alt="" width="342" height="333"><div aria-label="Meridian Interface"><b>MERIDIAN</b><span>INTERFACE</span></div><a href="/">meridianinterface.com</a></div>
<p class="state">Websites and systems that <em>bring customers in.</em></p>
<div class="who"><div class="av"><img src="/brand/meridian-mark.png" alt="" width="342" height="333"></div><div><h1>Otis Williams</h1><p>Web Designer &amp; Developer · Houston, TX</p></div></div>
<a class="btn primary" href="{BOOK}">{ic("cal")}Book your 1-on-1 appointment</a>
<div class="row2"><a href="{TEL}">{ic("phone")}Call</a><a href="{SMS}">{ic("text")}Text</a><a href="{MAIL}">{ic("mail")}Email</a><a href="{VCF}" download="Otis Williams.vcf">{ic("add")}Save contact</a></div>
<h2>What I build</h2><div class="svc"><div>Websites<small>Built to get found</small></div><div>Online stores<small>Sell around the clock</small></div><div>Booking systems<small>Fill your calendar</small></div><div>CRM<small>Every lead in one place</small></div><div>Video ads<small>Reach the right people</small></div></div>
<h2>Recent work</h2><div class="work">{work}</div>
<div class="qr"><i><img src="/card/qr.svg" alt="QR code that opens this card" width="76" height="76"></i><p><b>Scan to open this card</b>Share it from your phone in one tap.</p></div></main>'''

for k,(css,body,bg) in {'a':(A_css,A_body,'#eef2f8'),'b':(B_css,B_body,'#0a1020'),'c':(C_css,C_body,'#dfe5ee'),'d':(D_css,D_body,'#0f172a')}.items():
  (L/'site'/k/'index.html').write_text(page('', css, body, bg))
print('written')
