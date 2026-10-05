#!/usr/bin/env bash
# Static half of the Meridian pre-launch QA. Run from the website repo root:
#   bash <skill>/scripts/static.sh
# Exit code 0 = no FAIL lines. WARN lines are for a human to read.
set -u
SITE="${1:-$(pwd)}"
cd "$SITE" || { echo "FAIL cannot cd to $SITE"; exit 2; }
[ -f package.json ] && [ -d public/demos ] || { echo "FAIL $SITE is not the meridian-interface-website repo"; exit 2; }
fails=0; warns=0
fail() { echo "FAIL $*"; fails=$((fails+1)); }
warn() { echo "WARN $*"; warns=$((warns+1)); }
ok()   { echo "ok   $*"; }

# 1. Types and build. A red build never ships.
if npx tsc --noEmit -p . >/tmp/qa-tsc.txt 2>&1; then ok "typecheck"; else fail "typecheck: $(grep -c 'error TS' /tmp/qa-tsc.txt) errors (see /tmp/qa-tsc.txt)"; fi
if npm run build >/tmp/qa-build.txt 2>&1; then ok "build"; else fail "build failed (see /tmp/qa-build.txt)"; fi
grep -q "chunks are larger than" /tmp/qa-build.txt && warn "a JS chunk is over 500 kB; lazy-load something"

# 2. Known-vulnerable packages, site and every demo source that has a lockfile.
for d in . $(ls -d */ | tr -d / ); do
  [ -f "$d/package-lock.json" ] || continue
  [ "$d" = "node_modules" ] && continue
  out=$(cd "$d" && npm audit --json 2>/dev/null | node -e '
    let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{try{const v=JSON.parse(s).vulnerabilities||{};
    const bad=Object.entries(v).filter(([,x])=>["high","critical"].includes(x.severity)).map(([k,x])=>k+"("+x.severity+(x.fixAvailable?",fix":",nofix")+")");
    console.log(bad.join(" "))}catch{console.log("")}})')
  if [ -n "$out" ]; then
    case "$out" in *",fix)"*) fail "npm audit $d: $out (run npm audit fix there)";; *) warn "npm audit $d: $out (no npm fix; see SESSION.md)";; esac
  fi
done
ok "npm audit scanned"

# 3. Secrets in what the browser downloads. Public web keys (Supabase anon,
#    Firebase web) are allowed; anything that is a server secret is not.
hits=$(grep -rEoh "sk_live_[A-Za-z0-9]{8,}|rk_live_[A-Za-z0-9]{8,}|sk-ant-[A-Za-z0-9_-]{8,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{30,}|xox[bp]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY" dist 2>/dev/null | sort -u | cut -c1-12)
[ -n "$hits" ] && fail "secret-looking strings in dist: $hits" || ok "no server secrets in dist"
for t in $(grep -rEoh "eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}" dist 2>/dev/null | sort -u); do
  echo "$t" | cut -d. -f2 | base64 -d 2>/dev/null | grep -q '"service_role"' && fail "a Supabase SERVICE ROLE key is in dist"
done

# 4. Every picture and demo the site links to exists; flag files nothing uses.
node - <<'NODE' || fails=$((fails+1))
const fs=require('fs'),path=require('path');
const src=fs.readdirSync('src',{recursive:true}).filter(f=>/\.(tsx?|css)$/.test(f)).map(f=>fs.readFileSync(path.join('src',f),'utf8')).join('\n')+fs.readFileSync('index.html','utf8');
let bad=0;
for (const m of new Set(src.match(/['"`(]\/(images|video|brand|fonts)\/[^'"`)\s?#]+/g)||[])) {
  if (/[<>]|\$\{/.test(m)) continue; // a placeholder in a comment, not a real path
  const p='public'+m.slice(1); if(!fs.existsSync(p)){console.log('FAIL missing file '+p);bad++;}
}
for (const m of new Set(src.match(/demo:\s*['"]\/demos\/[^'"]+['"]/g)||[])) {
  const slug=m.match(/\/demos\/([^/'"?]+)/)[1];
  if(!fs.existsSync(`public/demos/${slug}/index.html`)){console.log('FAIL demo link points at missing /demos/'+slug);bad++;}
}
const linked=new Set((src.match(/\/demos\/[a-z0-9-]+/g)||[]).map(s=>s.split('/')[2]));
for (const d of fs.readdirSync('public/demos',{withFileTypes:true}).filter(d=>d.isDirectory())) if(!linked.has(d.name)) console.log('WARN /demos/'+d.name+' is hosted but nothing on the site links to it');
const port=fs.readdirSync('public/images/portfolio');
for (const f of port) if(!src.includes('/images/portfolio/'+f)) console.log('WARN public/images/portfolio/'+f+' is not used anywhere');
console.log(bad? '' : 'ok   every linked picture and demo exists');
process.exit(bad?1:0);
NODE

# 5. Icons. The site ships a SUBSET of Material Symbols; a name missing from it
#    renders as the word ("ExPLORE"). Needs python3 + fontTools.
if python3 -c "import fontTools" 2>/dev/null; then
python3 - <<'PY' || fails=$((fails+1))
import re,glob,sys
from fontTools.ttLib import TTFont
f=TTFont('public/fonts/material-symbols-subset.woff2'); rev={v:chr(k) for k,v in f.getBestCmap().items()}; names=set()
for lk in f['GSUB'].table.LookupList.Lookup:
    for st in lk.SubTable:
        st=getattr(st,'ExtSubTable',st)
        for first,ligs in getattr(st,'ligatures',{}).items():
            for l in ligs: names.add(rev.get(first,'?')+''.join(rev.get(c,'?') for c in l.Component))
used={}
for fn in glob.glob('src/**/*.ts*',recursive=True):
    s=open(fn).read()
    for m in re.finditer(r'material-symbols-outlined[^>]*>\s*([a-z][a-z0-9_]{1,40})\s*<',s): used.setdefault(m.group(1),set()).add(fn)
    for m in re.finditer(r"\bicon:\s*'([a-z][a-z0-9_]{1,40})'",s): used.setdefault(m.group(1),set()).add(fn)
miss={k:v for k,v in used.items() if k not in names}
for k,v in miss.items(): print('FAIL icon "%s" is not in the icon subset (%s)'%(k,', '.join(sorted(v))))
print('ok   %d icons, all in the subset'%len(used) if not miss else '')
sys.exit(1 if miss else 0)
PY
else warn "python3 fontTools not installed; icon subset not checked (pip install fonttools)"; fi

# 6. Honest demos. A hosted demo must never tell a visitor something happened
#    that did not: a real customer of a real shop can land on it.
for js in public/demos/*/assets/*.js; do
  slug=$(echo "$js" | cut -d/ -f3)
  for phrase in "has received your request" "Message Sent To The Shop" "confirmation has been dispatched" "SMS Alert Sent" "Total Charged" "911 Emergency Services auto-routed" "Responders may contact you" "Transmitting Order to"; do
    if grep -q "$phrase" "$js"; then
      # allowed only if the same bundle also carries a demonstration notice
      grep -qiE "demonstration|nothing was sent|not sent|demo copy|IS_DEMO_COPY|no kitchen received" "$js" \
        && warn "/demos/$slug says \"$phrase\"; a demo notice exists in the bundle, confirm it shows on that screen" \
        || fail "/demos/$slug says \"$phrase\" with no demonstration notice"
    fi
  done
  grep -oE 'children:"(Gemini|GPT|Claude)[^"]{0,24}"' "$js" | head -1 | grep -q . && warn "/demos/$slug shows an AI model badge; is a live model really behind it?"
done
ok "demo honesty phrases scanned"

# 7. Off-site resources a demo hotlinks. The site CSP blocks most of them, so
#    they show as blanks live. Fonts and planner calls are allowed by policy.
for d in public/demos/*/; do
  slug=$(basename "$d")
  hl=$(grep -rEoh "https://(images\.unsplash\.com|lh3\.googleusercontent\.com|[a-z0-9.-]*aida-public[^\"']*|www\.google\.com/maps/embed)" "$d" 2>/dev/null | sort -u | head -3)
  [ -n "$hl" ] && fail "/demos/$slug hotlinks: $hl"
done
ok "demo hotlinks scanned"

# (Long dashes in visitor copy are checked in the browser pass, on rendered
#  text, because source comments are full of them.)

echo "----"
echo "static: $fails FAIL, $warns WARN"
exit $([ $fails -eq 0 ] && echo 0 || echo 1)
