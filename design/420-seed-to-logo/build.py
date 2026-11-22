import base64, sys, pathlib
src = pathlib.Path('grow.src.html').read_text()
logo = 'data:image/webp;base64,' + base64.b64encode(pathlib.Path('logo-lg.webp').read_bytes()).decode()
aud = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
audio = ('data:audio/mpeg;base64,' + base64.b64encode(aud.read_bytes()).decode()) if aud and aud.exists() else ''
out = src.replace('__LOGO__', logo).replace('__AUDIO__', audio)
pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else 'grow.html').write_text(out)
print('built', len(out)//1024, 'KB')
