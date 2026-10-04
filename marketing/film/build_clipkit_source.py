import json
A="https://api.clipkit.dev/storage/v1/object/public/assets/anon/"
INF=A+"fb509d80-5576-41d2-8c1a-498213584c52.png"; PEACH=A+"79e7b0f9-65c5-45f5-ac40-98f69a7ff64e.png"; ELX=A+"0569e71d-1459-4769-a60c-6e469418955c.png"
LOGO=A+"bba26203-74f6-46b8-8b9f-909dafb21d2a.png"   # white logo on black, screen-blended (RGBA cutouts render as a white box in the Clipkit runtime)
MATCH2=A+"f3d0a039-09d0-495f-9863-c1c0862d05f2.mp3"   # ElevenLabs SFX: scratch, flare, crackling embers
SCORE=A+"93b20ae6-0705-456b-8497-51d200fed8c6.mp3"; MATCH=A+"35c75ea3-1677-42b3-a09d-a898e0ee1c74.mp3"
FS="https://cdn.jsdelivr.net/npm/@fontsource/"
SERIF="Cormorant Garamond"; SANS="Jost"; W="#ffffff"; E="ease-in-out-sine"
def k(*pts):
    out=[]
    for p in pts:
        d={"time":round(p[0],3),"value":p[1]}
        if len(p)>2: d["easing"]=p[2]
        out.append(d)
    return out
L=[0]
def ly(): L[0]+=1; return L[0]
_UNUSED_SWEEP=("let a = texture(cut, uv).a; let d = uv.x*0.9 + uv.y*0.45 - sweep; "
       "let band = smoothstep(0.16, 0.0, abs(d)); rgba(1.0, 1.0, 1.0, a * band * strength)")
_UNUSED_SMOKE=("let y = 1.0 - uv.y; "
       "let p = vec2(uv.x*2.2 + 0.45*sin(y*5.0 - t*0.7) + 0.35*noise(vec2(y*2.5, t*0.25)), y*2.6 - t*0.22); "
       "let n = noise(p*2.0) * 0.65 + noise(p*4.3 + vec2(3.1, 1.7)) * 0.35; "
       "let wisp = smoothstep(0.52, 0.82, n); "
       "let cx = smoothstep(0.5, 0.05, abs(uv.x - 0.5 - 0.08*sin(y*4.0 + t*0.5))); "
       "let fy = smoothstep(0.0, 0.25, y) * smoothstep(1.0, 0.45, y); "
       "rgba(1.0, 1.0, 1.0, wisp * cx * fy * amount)")
def candle(id,src,w,h,cx,base,t0,dur,fade=0.9,scale=None,dx=None,sweep_at=None,sweep_len=1.8,bright=None,refl=0.26,lab=None):
    """A cutout standing on the polished black surface, with its reflection and an alpha-masked light sweep."""
    kids=[
      {"type":"image","id":id+"_refl","layer":1,"source":src,"x":0,"y":2*h,"width":w,"height":h,"fit":"fill",
       "y_scale":-1,"opacity":refl,"blur_radius":2,"saturation":0},
      {"type":"shape","id":id+"_reflfade","layer":2,"x":-40,"y":h-2,"width":w+80,"height":int(h*0.75),
       "gradient":{"type":"linear","angle":180,"stops":[{"offset":0,"color":"rgba(0,0,0,0.15)"},{"offset":0.55,"color":"rgba(0,0,0,1)"},{"offset":1,"color":"rgba(0,0,0,1)"}]}},
      {"type":"image","id":id+"_img","layer":3,"source":src,"x":0,"y":0,"width":w,"height":h,"fit":"fill","saturation":0},
    ]
    if bright: kids[2]["brightness"]=bright; kids[0]["brightness"]=bright
    if sweep_at is not None and lab:
        lx,ly_,lx2,ly2=lab; gw=(lx2-lx)*w; gh=(ly2-ly_)*h; bw=gw*0.45
        kids.append({"type":"group","id":id+"_sweep","layer":4,"time":sweep_at,"duration":sweep_len,"x":lx*w,"y":ly_*h,
          "width":gw,"height":gh,"clip":True,"elements":[
            {"type":"shape","id":id+"_bar","layer":1,"y":-gh*0.3,"width":bw,"height":gh*1.6,"rotation":18,"blend_mode":"screen",
             "gradient":{"type":"linear","angle":90,"stops":[{"offset":0,"color":"rgba(255,255,255,0)"},{"offset":0.5,"color":"rgba(255,255,255,0.38)"},{"offset":1,"color":"rgba(255,255,255,0)"}]},
             "x":k((0,-bw*1.3),(sweep_len,gw+bw*0.3,E))}]})
    g={"type":"group","id":id,"layer":ly(),"time":t0,"duration":dur,"x":cx-w/2,"y":base-h,"width":w,"height":h,"elements":kids,
       "opacity":k((0,0),(fade,1,E),(dur-fade,1),(dur,0,E))}
    if scale: g["scale"]=scale
    if dx: g["x"]=dx
    return g
def smoke(id,t0,dur,x,y,amount,rate=7):
    return {"type":"particles","id":id,"layer":ly(),"time":t0,"duration":dur,"x":x,"y":y,"x_anchor":"50%","y_anchor":"50%",
      "width":24,"height":10,"rate":rate,"velocity":46,"spread":18,"direction":-90,"gravity":-14,"lifetime":3.2,
      "size":34,"size_variation":0.7,"particle_shape":"circle","color":["#ffffff","#e6e6e6"],"fade_at":0.25,
      "blend_mode":"screen","rotation_speed":0,"blur_radius":16,
      "opacity":k((0,0),(0.9,amount,E),(dur-0.9,amount),(dur,0,E))}
def glow(id,t0,dur,x,y,size,peak=1.0,flicker=True,opac=None):
    e={"type":"shape","id":id,"shape":"ellipse","layer":ly(),"time":t0,"duration":dur,"blend_mode":"screen",
       "x_anchor":"50%","y_anchor":"50%","x":x,"y":y,"width":size,"height":size,
       "gradient":{"type":"radial","stops":[{"offset":0,"color":"rgba(255,255,255,0.55)"},{"offset":0.3,"color":"rgba(255,255,255,0.16)"},{"offset":1,"color":"rgba(255,255,255,0)"}]}}
    e["opacity"]=opac if opac else {"expr":f"min(1, t/0.8) * min(1, (dur - t)/0.8) * {peak} * (0.86 + 0.09*noise(t*5.0, 7) + 0.05*sin(t*13.0))"}
    return e
def label(id,text,t0,dur,y,size=58,track=14,family=SERIF,weight=300,style="normal",upper=True,op=0.92):
    return {"type":"text","id":id,"layer":ly(),"time":t0,"duration":dur,"x":0,"y":y,"width":1080,"text_align":"center",
      "text":text,"font_family":family,"font_weight":weight,"font_style":style,"font_size":size,"letter_spacing":track,
      "fill_color":W,"line_height":1.0,
      "opacity":k((0,0),(1.0,op,E),(dur-1.0,op),(dur,0,E)),
      "keyframe_animations":[{"property":"y","keyframes":k((0,y+14),(1.6,y,"ease-out-cubic"))},
                              {"property":"blur_radius","keyframes":k((0,6),(1.2,0,E))}]}
els=[]
els.append({"type":"shape","id":"bg","layer":ly(),"time":0,"duration":"end","width":"100%","height":"100%","fill_color":"#000000"})
# polished black surface: faint sheen along the horizon
els.append({"type":"shape","id":"surface_sheen","shape":"ellipse","layer":ly(),"time":3.6,"duration":10.4,"x":540,"y":1310,
  "x_anchor":"50%","y_anchor":"50%","width":1500,"height":150,
  "gradient":{"type":"radial","stops":[{"offset":0,"color":"rgba(255,255,255,0.10)"},{"offset":1,"color":"rgba(255,255,255,0)"}]},
  "opacity":k((0,0),(1.4,1,E),(9.2,1),(10.4,0,E))})
# ---------- OPENING (0-4.6): darkness, a match strikes, the flame lights Inferno Dreams ----------
IW,IH=448*1.7,640*1.7  # 762 x 1088
op={"type":"group","id":"open_candle","layer":ly(),"time":0,"duration":5.3,"x":540,"y":1103,"x_anchor":"50%","y_anchor":"50%",
    "width":IW,"height":IH,
    "scale":k((0,2.4),(0.6,2.4),(0.68,2.47,"ease-out-expo"),(1.0,2.4,E),(4.6,1.0,E)),
    "x":k((0,559),(1.0,559),(4.6,540,E)),"y":k((0,1811),(1.0,1811),(4.6,1103,E)),
    "opacity":k((0,1),(4.4,1),(5.3,0,E)),
    "elements":[
      {"type":"image","id":"open_img","layer":1,"source":INF,"x":0,"y":0,"width":IW,"height":IH,"fit":"fill","saturation":0,
       "brightness":k((0,0),(0.58,0),(0.66,0.62,"ease-out-expo"),(1.0,0.32,E),(3.2,1.0,E))},
      {"type":"group","id":"open_sweep","layer":2,"time":2.6,"duration":2.0,"x":0.09*IW,"y":0.257*IH,"width":0.77*IW,"height":0.598*IH,"clip":True,
       "elements":[{"type":"shape","id":"open_bar","layer":1,"y":-0.598*IH*0.3,"width":0.77*IW*0.45,"height":0.598*IH*1.6,"rotation":18,"blend_mode":"screen",
         "gradient":{"type":"linear","angle":90,"stops":[{"offset":0,"color":"rgba(255,255,255,0)"},{"offset":0.5,"color":"rgba(255,255,255,0.4)"},{"offset":1,"color":"rgba(255,255,255,0)"}]},
         "x":k((0,-0.77*IW*0.6),(2.0,0.77*IW*1.15,E))}]}]}
els.append(op)
# ---------- THE STRIKE (0.45-2.6): scratch, ignition, shockwave, anamorphic flare, sparks, embers, smoke ----------
SX,SY=540,820                     # where the match head meets the striker (the wick, in the close-up)
WHITES=[W,"#ececec","#d0d0d0"]
def rad(stops): return {"type":"radial","stops":stops}
def seq(id,t0,dur,**kw):
    e={"id":id,"layer":ly(),"time":t0,"duration":dur}; e.update(kw); return e
# the scratch: a short bright streak that draws itself along the striker, with a fizz of grit behind it
els.append(seq("scratch",0.45,0.3,type="shape",shape="rectangle",x=SX-150,y=SY+40,x_anchor="0%",y_anchor="50%",height=5,rotation=-22,
  blend_mode="screen",blur_radius=1.2,border_radius=3,
  gradient={"type":"linear","angle":90,"stops":[{"offset":0,"color":"rgba(255,255,255,0)"},{"offset":0.35,"color":"rgba(255,255,255,0.7)"},{"offset":1,"color":"rgba(255,255,255,1)"}]},
  width=k((0,0),(0.15,300,"ease-in-quad")),
  opacity=k((0,0),(0.03,1),(0.15,1),(0.3,0,"ease-out-quad"))))
els.append(seq("grit",0.47,0.18,type="particles",x=k((0,SX-150),(0.16,SX+120,"ease-in-quad")),y=k((0,SY+100),(0.16,SY-10,"ease-in-quad")),
  x_anchor="50%",y_anchor="50%",width=6,height=6,rate=380,velocity=170,spread=70,direction=-60,gravity=900,lifetime=0.32,size=3,size_variation=0.6,
  particle_shape="circle",color=WHITES,fade_at=0.3,blend_mode="screen",rotation_speed=0))
# ignition: a hot white core that blooms and collapses, a full-frame exposure kick, and the big soft flash
els.append(seq("core",0.6,0.55,type="shape",shape="ellipse",x=SX,y=SY,x_anchor="50%",y_anchor="50%",width=70,height=70,blend_mode="screen",blur_radius=3,
  gradient=rad([{"offset":0,"color":"rgba(255,255,255,1)"},{"offset":0.45,"color":"rgba(255,255,255,0.85)"},{"offset":1,"color":"rgba(255,255,255,0)"}]),
  scale=k((0,0.2),(0.1,1.7,"ease-out-expo"),(0.55,0.6,E)),opacity=k((0,0),(0.04,1),(0.2,1),(0.55,0,E))))
els.append(seq("exposure",0.6,0.5,type="shape",width="100%",height="100%",fill_color=W,blend_mode="screen",
  opacity=k((0,0),(0.05,0.22,"ease-out-expo"),(0.42,0,"ease-out-quad"))))
els.append(glow("strike_flash",0.6,1.4,SX,SY,900,opac=k((0,0),(0.07,1.0),(0.45,0.5,E),(1.4,0,E))))
# the shockwave: a thin ring racing outward and thinning to nothing
els.append(seq("ring",0.62,0.7,type="shape",shape="ellipse",x=SX,y=SY,x_anchor="50%",y_anchor="50%",blend_mode="screen",blur_radius=1.5,
  gradient=rad([{"offset":0,"color":"rgba(255,255,255,0)"},{"offset":0.86,"color":"rgba(255,255,255,0)"},{"offset":0.93,"color":"rgba(255,255,255,0.9)"},{"offset":1,"color":"rgba(255,255,255,0)"}]),
  width=k((0,24),(0.7,1150,"ease-out-quart")),height=k((0,24),(0.7,1150,"ease-out-quart")),
  opacity=k((0,0.95),(0.25,0.6),(0.7,0,"ease-out-quad"))))
# the light spreading across the frame: a razor anamorphic streak and a wide soft wash behind it
els.append(seq("streak",0.6,1.3,type="shape",shape="rectangle",x=SX,y=SY,x_anchor="50%",y_anchor="50%",height=10,blend_mode="screen",blur_radius=5,border_radius=5,
  gradient={"type":"linear","angle":90,"stops":[{"offset":0,"color":"rgba(255,255,255,0)"},{"offset":0.2,"color":"rgba(255,255,255,0.35)"},{"offset":0.5,"color":"rgba(255,255,255,1)"},{"offset":0.8,"color":"rgba(255,255,255,0.35)"},{"offset":1,"color":"rgba(255,255,255,0)"}]},
  width=k((0,120),(0.35,2400,"ease-out-expo")),opacity=k((0,0),(0.05,1),(0.4,0.8),(1.3,0,E))))
els.append(seq("wash",0.6,2.0,type="shape",shape="ellipse",x=SX,y=SY,x_anchor="50%",y_anchor="50%",height=420,blend_mode="screen",blur_radius=40,
  gradient=rad([{"offset":0,"color":"rgba(255,255,255,0.5)"},{"offset":0.5,"color":"rgba(255,255,255,0.18)"},{"offset":1,"color":"rgba(255,255,255,0)"}]),
  width=k((0,200),(1.0,2600,"ease-out-quart")),opacity=k((0,0),(0.08,1),(0.6,0.55,E),(2.0,0,E))))
# sparks: a fast bright shower, slow glowing embers that rise and drift down, and a rain of grit
els.append(seq("sparks",0.6,1.2,type="particles",x=SX,y=SY,x_anchor="50%",y_anchor="50%",width=24,height=24,burst=True,burst_count=220,
  velocity=640,spread=360,direction=-90,gravity=720,lifetime=0.85,size=5,size_variation=0.6,particle_shape="circle",color=WHITES,fade_at=0.35,
  blend_mode="screen",rotation_speed=0,effects=[{"type":"glow","radius":8,"intensity":1.2}]))
els.append(seq("sparks_big",0.6,1.3,type="particles",x=SX,y=SY,x_anchor="50%",y_anchor="50%",width=24,height=24,burst=True,burst_count=40,
  velocity=430,spread=360,direction=-90,gravity=520,lifetime=1.1,size=8,size_variation=0.5,particle_shape="circle",color=WHITES,fade_at=0.4,
  blend_mode="screen",rotation_speed=0,blur_radius=0.6,effects=[{"type":"glow","radius":12,"intensity":1.4}]))
els.append(seq("embers",0.62,2.6,type="particles",x=SX,y=SY,x_anchor="50%",y_anchor="50%",width=30,height=30,burst=True,burst_count=70,
  velocity=230,spread=150,direction=-90,gravity=120,lifetime=2.3,size=5,size_variation=0.7,particle_shape="circle",color=WHITES,fade_at=0.45,
  blend_mode="screen",rotation_speed=0,blur_radius=0.8,effects=[{"type":"glow","radius":10,"intensity":1.3}],
  opacity=k((0,1),(1.8,1),(2.6,0,E))))
els.append(seq("grit_rain",0.64,0.9,type="particles",x=SX,y=SY,x_anchor="50%",y_anchor="50%",width=40,height=40,rate=120,
  velocity=180,spread=360,direction=-90,gravity=560,lifetime=1.0,size=2.2,size_variation=0.6,particle_shape="circle",color=WHITES,fade_at=0.4,
  blend_mode="screen",rotation_speed=0,opacity=k((0,1),(0.6,1),(0.9,0,E))))
# the puff of smoke a strike leaves, then the slow curl once the flame holds
els.append(seq("puff",0.72,1.6,type="particles",x=SX,y=SY-20,x_anchor="50%",y_anchor="50%",width=30,height=12,rate=36,
  velocity=95,spread=46,direction=-90,gravity=-40,lifetime=1.5,size=44,size_variation=0.6,particle_shape="circle",color=[W,"#e6e6e6"],fade_at=0.2,
  blend_mode="screen",rotation_speed=0,blur_radius=18,opacity=k((0,0),(0.2,0.5,E),(0.9,0.5),(1.6,0,E))))
els.append(glow("open_glow",0.9,4.4,SX,SY,520,peak=0.9))
els[-1]["x"]=k((0,540),(0.1,540),(3.7,532,E)); els[-1]["y"]=k((0,820),(0.1,820),(3.7,690,E)); els[-1]["width"]=k((0,700),(0.1,700),(3.7,300,E)); els[-1]["height"]=k((0,700),(0.1,700),(3.7,300,E))
els.append(smoke("open_smoke",2.4,2.9,532,600,0.55,rate=6))
# ---------- MIDDLE (4.3-11.6): the collection, one scent at a time ----------
B=1310
els.append(candle("peach",PEACH,295*2.05,385*2.05,540,B,4.3,3.1,fade=1.0,
   scale=k((0,1.0),(3.1,1.07,"linear")),dx=k((0,540-302+26),(3.1,540-302-26,"linear")),sweep_at=0.9,sweep_len=1.9,lab=(0.163,0.23,0.861,0.81)))
els.append(label("t_peach","EXOTIC PEACH",4.9,2.4,1520))
els.append(candle("elixir",ELX,555*1.12,770*1.12,540,B,6.6,3.1,fade=1.0,
   scale=k((0,1.06),(3.1,1.0,"linear")),dx=k((0,540-311-24),(3.1,540-311+24,"linear")),sweep_at=0.9,sweep_len=1.9,lab=(0.153,0.41,0.847,0.90)))
els.append(label("t_elixir","BREWED ELIXIR",7.2,2.4,1520))
els.append(candle("inferno",INF,448*1.45,640*1.45,540,B,8.9,3.1,fade=1.0,
   scale=k((0,1.0),(3.1,1.08,"linear")),sweep_at=1.0,sweep_len=1.9,lab=(0.09,0.257,0.86,0.855)))
els.append(glow("inferno_glow",8.9,3.1,532,B-640*1.45+0.12*640*1.45,330,peak=0.8))
els.append(smoke("inferno_smoke",9.1,2.9,532,440,0.6))
els.append(label("t_inferno","INFERNO DREAMS",9.5,2.4,1520))
# ---------- CLOSING (11.4-15): the collection together, low-key, then the wordmark ----------
CL=10.9; CD=2.7
els.append(candle("c_peach",PEACH,383,500,250,B-20,CL,CD,fade=1.1,bright=0.62,refl=0.2))
els.append(candle("c_elixir",ELX,384,533,830,B-20,CL,CD,fade=1.1,bright=0.62,refl=0.2))
els.append(candle("c_inferno",INF,448,640,540,B+30,CL,CD,fade=1.1,bright=0.85,refl=0.24))
els.append(glow("c_glow",CL,CD,537,B+30-640+0.12*640,300,peak=0.85))
els.append(smoke("c_smoke",CL+0.3,CD-0.3,537,690,0.45,rate=5))
# ---------- grade: vignette + fine film grain ----------
els.append({"type":"shape","id":"vignette","layer":ly(),"time":0,"duration":"end","width":"100%","height":"100%",
  "gradient":{"type":"radial","stops":[{"offset":0,"color":"rgba(0,0,0,0)"},{"offset":0.55,"color":"rgba(0,0,0,0)"},{"offset":1,"color":"rgba(0,0,0,0.78)"}]}})
els.append({"type":"shape","id":"grain","layer":ly(),"time":0,"duration":"end","width":"100%","height":"100%","fill_color":"#808080",
  "blend_mode":"overlay","opacity":0.2,
  "effects":[{"type":"fractal_noise","scale":1.6,"octaves":1,"evolution":{"expr":"floor(t*24.0)*3.7"},"seed":7}]})
# ---------- end card: the Secrets of Cint logo (white cutout of the brand mark), rule, tagline ----------
els.append({"type":"image","id":"logo","layer":ly(),"time":12.8,"duration":2.2,"source":LOGO,"x":540,"x_anchor":"50%","y":700,
  "width":620,"height":415,"fit":"contain","blend_mode":"screen",
  "opacity":k((0,0),(1.3,1,E),(1.75,1),(2.2,0.0,E)),
  "keyframe_animations":[{"property":"blur_radius","keyframes":k((0,8),(1.3,0,E))},
                         {"property":"scale","keyframes":k((0,1.05),(2.2,1.0,E))}]})
els.append({"type":"shape","id":"wm_rule","layer":ly(),"time":13.3,"duration":1.7,"x":540,"x_anchor":"50%","y":1160,"height":1,
  "fill_color":W,"width":k((0,0),(0.9,90,E)),"opacity":k((0,0.6),(1.25,0.6),(1.7,0,E))})
els.append({"type":"text","id":"tagline","layer":ly(),"time":13.4,"duration":1.6,"x":0,"y":1196,"width":1080,"text_align":"center",
  "text":"A NEW LIFE CANDLE EXPERIENCE","font_family":SANS,"font_weight":300,"font_size":24,"letter_spacing":10,"fill_color":W,
  "opacity":k((0,0),(0.8,0.8,E),(1.15,0.8),(1.6,0,E))})
# ---------- sound ----------
els.append({"type":"audio","id":"score","layer":ly(),"source":SCORE,"time":0,"duration":15,"volume":100,"audio_fade_out":1.2})
els.append({"type":"audio","id":"match","layer":ly(),"source":MATCH,"time":0.5,"duration":1.0,"volume":45})
els.append({"type":"audio","id":"match2","layer":ly(),"source":MATCH2,"time":0.45,"duration":1.0,"volume":90})
fonts=[{"family":SERIF,"weight":300,"style":"normal","src":FS+"cormorant-garamond@5.3.0/files/cormorant-garamond-latin-300-normal.woff2"},
       {"family":SANS,"weight":300,"style":"normal","src":FS+"jost@5.3.0/files/jost-latin-300-normal.woff2"}]
src={"clipkit_version":"1.0","width":1080,"height":1920,"duration":15,"frame_rate":24,"background_color":"#000000","fonts":fonts,"elements":els}
s=json.dumps(src,separators=(',',':'))
open(__file__.replace('.py','.json'),'w').write(s); print(len(els),'elements',len(s),'bytes')
