import pathlib, re
SP = pathlib.Path('.').resolve()
src = pathlib.Path('/home/user/all-in-1-events-2/420-friendly/index.html').read_text()
src = src.replace('<head>', '<head>\n<base href="file:///home/user/all-in-1-events-2/420-friendly/">', 1)
img = re.search(r'<img src="assets/logo-lg.webp".*?/>', src, re.S).group(0)
new = f'''<div id="orbit-box" style="position:relative">
        <img id="orbit" src="file://{SP}/seq/000.png" alt="" aria-hidden="true" width="767" height="921"
             style="display:block;position:relative;z-index:1"/>
        <div id="orbit-shadow" style="position:absolute;left:16%;right:16%;bottom:-3%;height:6%;border-radius:50%;
             background:radial-gradient(closest-side,rgba(10,30,15,.30),rgba(10,30,15,0));filter:blur(3px)"></div>
      </div>'''
css = '''<style>
#orbit{height:62vh;width:auto;max-width:none;}
@media (max-width:767px){#orbit{height:31vh;}}
</style>'''
pathlib.Path('preview-D.html').write_text(src.replace(img, new).replace('</head>', css + '\n</head>', 1))
