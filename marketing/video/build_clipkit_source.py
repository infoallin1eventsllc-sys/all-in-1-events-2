import json
A="https://api.clipkit.dev/storage/v1/object/public/assets/anon/"
INF=A+"2f12d5b2-d0c9-4832-b1fd-d1f540a9192a.jpg"; MOON=A+"79ebae31-48ef-4ea3-be04-66c7a8703779.jpg"
HAR=A+"b750a573-bed1-4773-b7a6-e644d31a9427.jpg"; PEACH=A+"10670087-37c7-480c-a144-e22d48f4ccfc.jpg"
VO=A+"380adfb6-9c5c-42d3-9b0d-52ae472358e1.mp3"
FS="https://cdn.jsdelivr.net/npm/@fontsource/"
IV="#f7f4ef"; CH="#1f1d1a"; MUTED="#75706a"; AMBER="#ffb15c"
SERIF="Cormorant Garamond"; SERIF_I="Cormorant Garamond Italic"; SANS="Jost"
def k(*pts, e=None):
    out=[]
    for i,p in enumerate(pts):
        d={"time":p[0],"value":p[1]}
        if len(p)>2: d["easing"]=p[2]
        elif e and i>0: d["easing"]=e
        out.append(d)
    return out
EIO="ease-in-out-sine"
L=[0]
def layer(): L[0]+=1; return L[0]
els=[]
els.append({"type":"shape","id":"bg","layer":layer(),"time":0,"duration":"end","width":"100%","height":"100%","fill_color":CH})
# ---------- hero camera (one continuous move over the real photo) ----------
els.append({"type":"image","id":"hero","layer":layer(),"source":INF,"time":0,"duration":19.4,
  "width":1536,"height":1920,"x_anchor":"50%","y_anchor":"50%",
  "scale":k((0,2.6),(6.7,1.12,EIO),(14.3,1.3,"linear"),(15.0,1.3),(19.4,1.55,EIO)),
  "x":k((0,1239),(6.7,832,EIO),(14.3,879,"linear"),(15.0,879),(19.4,945,EIO)),
  "y":k((0,2217),(6.7,960,EIO),(14.3,990,"linear"),(15.0,1128,EIO),(19.4,1265,EIO)),
  "blur_radius":k((0,0),(7.2,0),(7.9,16,EIO),(14.3,16),(15.0,0,EIO)),
  "brightness":k((0,1),(7.2,1),(7.9,0.5,EIO),(14.3,0.5),(15.0,1,EIO)),
  "opacity":k((0,0),(0.7,1,EIO),(19.0,1),(19.4,0,EIO))})
els.append({"type":"shape","id":"vignette","layer":layer(),"time":0,"duration":19.4,"width":"100%","height":"100%",
  "gradient":{"type":"radial","stops":[{"offset":0,"color":"rgba(0,0,0,0)"},{"offset":0.5,"color":"rgba(0,0,0,0)"},{"offset":1,"color":"rgba(14,12,10,0.72)"}]},
  "opacity":k((0,1),(19.0,1),(19.4,0))})
els.append({"type":"shape","id":"scrim","layer":layer(),"time":0,"duration":19.4,"y":880,"width":1080,"height":1040,
  "gradient":{"type":"linear","angle":180,"stops":[{"offset":0,"color":"rgba(15,13,11,0)"},{"offset":0.38,"color":"rgba(15,13,11,0.55)"},{"offset":1,"color":"rgba(15,13,11,0.9)"}]},
  "opacity":k((0,1),(19.0,1),(19.4,0))})
def glow(id,t0,dur,p0,p1,s0,s1,fade_out_at):
    return {"type":"shape","id":id,"shape":"ellipse","layer":layer(),"time":t0,"duration":dur,"blend_mode":"screen",
      "x_anchor":"50%","y_anchor":"50%",
      "x":k((0,p0[0]),(dur-0.01 if fade_out_at is None else fade_out_at,p1[0],EIO)),
      "y":k((0,p0[1]),(dur-0.01 if fade_out_at is None else fade_out_at,p1[1],EIO)),
      "width":k((0,s0),(dur-0.01 if fade_out_at is None else fade_out_at,s1,EIO)),
      "height":k((0,s0),(dur-0.01 if fade_out_at is None else fade_out_at,s1,EIO)),
      "gradient":{"type":"radial","stops":[{"offset":0,"color":"rgba(255,186,110,0.62)"},{"offset":0.35,"color":"rgba(255,150,70,0.22)"},{"offset":1,"color":"rgba(255,150,70,0)"}]},
      "opacity":{"expr":"min(1, t/0.8) * min(1, (dur - t)/0.5) * (0.82 + 0.12*noise(t*6.5, 3) + 0.06*sin(t*17))"}}
els.append(glow("glow1",0,7.6,(540,800),(531,350),760,330,6.7))
els.append(glow("glow3",15.0,4.2,(529,420),(528,420),360,420,None))
els.append({"type":"particles","id":"fireburst","layer":layer(),"time":6.84,"duration":2.2,"x":531,"y":350,"x_anchor":"50%","y_anchor":"50%",
  "width":40,"height":40,"burst":True,"burst_count":120,"velocity":340,"spread":120,"direction":-90,"gravity":-60,
  "lifetime":1.8,"size":9,"size_variation":0.6,"particle_shape":"circle","color":[AMBER,"#ffd9a0",IV,"#ff8a3d"],
  "fade_at":0.4,"blend_mode":"screen","rotation_speed":0})
els.append({"type":"particles","id":"embers","layer":layer(),"time":15.0,"duration":4.2,"x":529,"y":430,"x_anchor":"50%","y_anchor":"50%",
  "width":60,"height":40,"rate":9,"velocity":60,"spread":50,"direction":-90,"gravity":-20,"lifetime":2.2,"size":5,
  "size_variation":0.6,"particle_shape":"circle","color":[AMBER,"#ffd9a0",IV],"fade_at":0.45,"blend_mode":"screen","rotation_speed":0})
# ---------- brand header + passe-partout frame ----------
els.append({"type":"text","id":"brand_top","layer":layer(),"time":0.4,"duration":18.8,"x":0,"y":118,"width":1080,"text_align":"center",
  "text":"SECRETS OF CINT","font_family":SANS,"font_weight":400,"font_size":24,"letter_spacing":12,"fill_color":IV,
  "keyframe_animations":[{"property":"opacity","keyframes":k((0,0),(1.0,0.85,EIO),(18.4,0.85),(18.8,0))}]})
els.append({"type":"shape","id":"frame_dark","layer":layer(),"time":0,"duration":21.2,"x":36,"y":36,"width":1008,"height":1848,
  "fill_color":"rgba(0,0,0,0)","stroke_color":IV,"stroke_width":1.5,"opacity":k((0,0),(1.2,0.3),(20.8,0.3),(21.2,0))})
# ---------- captions ----------
def cap(id,text,t0,t1,size=78,italic=True,weight=300,y=1330,extra=None):
    e={"type":"text","id":id,"layer":layer(),"time":t0,"duration":round(t1-t0,2),"x":70,"y":y,"width":940,"text_align":"center",
       "text":text,"font_family":SERIF_I if italic else SERIF,"font_weight":weight,"font_style":"normal","font_size":size,
       "fill_color":IV,"line_height":1.1,
       "text_shadow":{"color":"#000000","offset_x":0,"offset_y":2,"blur":22,"opacity":0.55},
       "keyframe_animations":[
         {"property":"y","stagger":{"each":0.07},"keyframes":k((0,26),(0.6,0,"ease-out-cubic"))},
         {"property":"opacity","stagger":{"each":0.07},"keyframes":k((0,0),(0.45,1,"ease-out-quad"))}],
       "animations":[{"type":"fade-out","time":"end","duration":0.25}]}
    if extra: e.update(extra)
    return e
els.append(cap("c_hi","Hi…",0.08,0.98,size=84))
els.append(cap("c_name","I'm Inferno Dreams.",1.0,2.55,size=96,italic=False))
c=cap("c_notes","Saffron.  Sandalwood.",2.6,4.95,size=84)
c["keyframe_animations"]=[{"property":"y","stagger":{"each":1.0},"keyframes":k((0,26),(0.6,0,"ease-out-cubic"))},
                          {"property":"opacity","stagger":{"each":1.0},"keyframes":k((0,0),(0.45,1,"ease-out-quad"))}]
els.append(c)
els.append(cap("c_little","And a little…",5.12,6.8,size=84))
els.append(cap("c_fire","fire.",6.84,7.55,size=180,y=1250,extra={
   "effects":[{"type":"glow","radius":34,"intensity":1.3,"color":AMBER}],
   "keyframe_animations":[{"property":"scale","keyframes":k((0,1.22),(0.5,1.0,"ease-out-cubic"))},
                          {"property":"opacity","keyframes":k((0,0),(0.18,1))}]}))
# ---------- S2: kinetic spec type over the softened candle ----------
def txt(id,text,t0,t1,y,size,family=SERIF,weight=300,style="normal",track=0,color=IV,upper=False,each=0.08):
    e={"type":"text","id":id,"layer":layer(),"time":t0,"duration":round(t1-t0,2),"x":40,"y":y,"width":1000,"text_align":"center",
       "text":text,"font_family":(SERIF_I if (style=="italic" and family==SERIF) else family),"font_weight":weight,"font_style":"normal","font_size":size,"letter_spacing":track,
       "fill_color":color,"line_height":1.05,
       "keyframe_animations":[
         {"property":"y","stagger":{"each":each},"keyframes":k((0,34),(0.7,0,"ease-out-cubic"))},
         {"property":"opacity","stagger":{"each":each},"keyframes":k((0,0),(0.5,1,"ease-out-quad"))}],
       "animations":[{"type":"fade-out","time":"end","duration":0.3}]}
    return e
els.append(txt("s2_eyebrow","HAND-POURED IN",7.4,9.2,800,30,family=SANS,weight=400,track=12))
els.append(txt("s2_sf","San Francisco",7.75,9.2,858,134,style="italic"))
els.append(txt("s2_wax","Pure soy wax.",9.34,12.2,790,108))
els.append(txt("s2_wick","Double cotton wick.",10.75,12.2,930,108,style="italic"))
els.append({"type":"text","id":"s2_50","layer":layer(),"time":12.38,"duration":1.92,"x":40,"y":610,"width":1000,"text_align":"center",
  "text":{"expr":"round(ease(t, 0.1, 1.1, 0, 50))","format":{"suffix":"+"}},
  "font_family":SERIF,"font_weight":300,"font_size":330,"fill_color":IV,"line_height":1.0,
  "effects":[{"type":"glow","radius":40,"intensity":0.55,"color":AMBER}],
  "keyframe_animations":[{"property":"opacity","keyframes":k((0,0),(0.35,1))},{"property":"scale","keyframes":k((0,0.92),(1.1,1.0,"ease-out-cubic"))}],
  "animations":[{"type":"fade-out","time":"end","duration":0.3}]})
els.append({"type":"shape","id":"s2_rule","layer":layer(),"time":12.7,"duration":1.6,"x":540,"x_anchor":"50%","y":985,"height":1.5,
  "fill_color":IV,"width":k((0,0),(0.7,120,"ease-out-cubic")),"opacity":k((0,0.7),(1.3,0.7),(1.6,0))})
els.append(txt("s2_hours","HOURS OF GLOW",12.85,14.3,1015,32,family=SANS,weight=400,track=14))
# ---------- S3 captions ----------
els.append(cap("c_go","So go ahead…",14.56,15.65))
els.append(cap("c_light","light me tonight,",15.76,17.15,size=88))
els.append(cap("c_mood","and let me set the mood.",17.24,18.95))
# ---------- S5 ivory backdrop ----------
els.append({"type":"shape","id":"ivory","layer":layer(),"time":20.8,"duration":"end","width":"100%","height":"100%","fill_color":"#faf8f5",
  "opacity":k((0,0),(0.45,1,EIO))})
# ---------- arch: S4 collection montage -> S5 Inferno ----------
AW,AH=620,860
def archimg(id,src,t0,t1,crop=None,fade=0.3):
    e={"type":"image","id":id,"layer":0,"source":src,"time":t0,"duration":round(t1-t0,2),"x":0,"y":0,"width":AW,"height":AH,
       "scale":k((0,1.08),(t1-t0,1.0,"linear")),"opacity":k((0,0),(fade,1,EIO))}
    if crop: e.update(crop)
    return e
kids=[archimg("a_harlem",HAR,0,1.0,fade=0.01),archimg("a_moon",MOON,0.55,1.6),archimg("a_peach",PEACH,1.1,2.2),
      archimg("a_inferno",INF,1.85,6.0,crop={"crop_x":0.02,"crop_y":0.1,"crop_width":0.62,"crop_height":0.69})]
for i,c in enumerate(kids): c["layer"]=i+1
els.append({"type":"group","id":"arch","layer":layer(),"time":19.0,"duration":6.0,"x":230,"y":230,"width":AW,"height":1240,
  "clip":True,"border_radius":310,"elements":kids,
  "keyframe_animations":[{"property":"opacity","keyframes":k((0,0),(0.6,1,EIO))},{"property":"y","keyframes":k((0,280),(0.9,230,"ease-out-cubic"))}]})
els.append({"type":"group","id":"arch_line_clip","layer":layer(),"time":19.3,"duration":5.7,"x":210,"y":210,"width":660,"height":880,"clip":True,
  "elements":[{"type":"shape","id":"arch_line","layer":1,"x":0,"y":0,"width":660,"height":1400,"border_radius":330,
     "fill_color":"rgba(0,0,0,0)","stroke_width":1.5,"stroke_color":"#bdb6aa"}],
  "keyframe_animations":[{"property":"opacity","keyframes":k((0,0),(0.8,0.9,EIO))}]})
# S4 wordmark (on charcoal)
els.append(txt("s4_word","Secrets of Cint",19.2,21.0,1150,124,each=0.05))
els[-1]["keyframe_animations"][0]["stagger"]["split"]="letter"; els[-1]["keyframe_animations"][1]["stagger"]["split"]="letter"
els.append(txt("s4_coll","THE COLLECTION",19.6,21.0,1310,26,family=SANS,weight=400,track=14))
# S5 sign-off (on ivory)
els.append({"type":"text","id":"s5_brand","layer":layer(),"time":21.2,"duration":3.8,"x":0,"y":118,"width":1080,"text_align":"center",
  "text":"SECRETS OF CINT","font_family":SANS,"font_weight":400,"font_size":24,"letter_spacing":12,"fill_color":CH,
  "opacity":k((0,0),(0.8,0.85,EIO))})
els.append({"type":"shape","id":"frame_light","layer":layer(),"time":21.0,"duration":4.0,"x":36,"y":36,"width":1008,"height":1848,
  "fill_color":"rgba(0,0,0,0)","stroke_color":"#d6d1c8","stroke_width":1.5,"opacity":k((0,0),(0.6,1))})
def dark(id,text,t0,y,size,family=SERIF,weight=300,style="normal",track=0,color=CH,each=0.08):
    e=txt(id,text,t0,25.0,y,size,family,weight,style,track,color,each=each); e.pop("animations"); return e
els.append(dark("s5_damn","Damn…",21.06,1150,124,style="italic"))
els.append(dark("s5_smell","that candle smell good.",21.94,1295,84))
els.append({"type":"shape","id":"s5_rule","layer":layer(),"time":22.9,"duration":2.1,"x":540,"x_anchor":"50%","y":1430,"height":1.5,
  "fill_color":"#bdb6aa","width":k((0,0),(0.8,140,"ease-out-cubic"))})
els.append(dark("s5_tag","HAND-POURED LUXURY SOY CANDLES",23.1,1466,24,family=SANS,weight=400,track=8,color=MUTED,each=0.05))
els.append(dark("s5_url","secretsofcint.com",23.4,1528,36,family=SANS,weight=400,track=4))
# ---------- the candle's own voice ----------
els.append({"type":"audio","id":"voice","layer":layer(),"source":VO,"time":0,"duration":23.7,"volume":100})
fonts=[{"family":SERIF,"weight":300,"style":"normal","src":FS+"cormorant-garamond@5.3.0/files/cormorant-garamond-latin-300-normal.woff2"},
       {"family":SERIF_I,"weight":300,"style":"normal","src":FS+"cormorant-garamond@5.3.0/files/cormorant-garamond-latin-300-italic.woff2"},
       {"family":SANS,"weight":400,"style":"normal","src":FS+"jost@5.3.0/files/jost-latin-400-normal.woff2"}]
src={"clipkit_version":"1.0","width":1080,"height":1920,"duration":25,"frame_rate":30,"background_color":CH,"fonts":fonts,"elements":els}
json.dump(src,open(__file__.replace('.py','.json'),'w'))
print(len(els),"elements")
