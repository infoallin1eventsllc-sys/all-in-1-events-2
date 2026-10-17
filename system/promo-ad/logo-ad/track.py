import cv2,numpy as np,json,sys
S=sys.argv[1];raw={}
def rfit(a,b):  # robust fit b = k*a + c
    ok=np.ones(len(a),bool)
    for _ in range(4):
        k,c=np.polyfit(a[ok],b[ok],1); r=np.abs(b-(k*a+c)); ok=r<max(2.0,np.median(r)*3)
    return k,c
def mask(i):
    im=cv2.imread(f'{S}/frames/{i:04d}.png').astype(int); B,G,R=im[...,0],im[...,1],im[...,2]
    m=((B-R>3)&(np.maximum(np.maximum(B,G),R)<110)).astype(np.uint8)
    m[:, :450]=0; m[:,1470:]=0
    m=cv2.morphologyEx(m,cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
    n,lab,st,_=cv2.connectedComponentsWithStats(m)
    keep=[k for k in range(1,n) if st[k][4]>200 and abs(st[k][0]+st[k][2]/2-960)<350]
    big=max(keep,key=lambda k:st[k][4])
    return (lab==big)
for i in range(35,122):
    gray=cv2.imread(f'{S}/frames/{i:04d}.png',0)
    m=mask(i); ys,xs=np.nonzero(m); y0,y1=ys.min(),ys.max(); x0,x1=xs.min(),xs.max()
    rows=np.arange(int(y0+0.1*(y1-y0)),int(y1-0.1*(y1-y0)))
    L=[];Rr=[]
    for y in rows:
        r=np.nonzero(m[y])[0]
        if len(r): L.append((y,r.min())); Rr.append((y,r.max()))
    L=np.array(L);Rr=np.array(Rr)
    kl,cl=rfit(L[:,0],L[:,1]); kr,cr=rfit(Rr[:,0],Rr[:,1])
    cols=np.arange(int(x0+0.2*(x1-x0)),int(x1-0.2*(x1-x0)))
    T=[];Bt=[]
    for x in cols:
        c=np.nonzero(m[:,x])[0]
        if len(c):
            Bt.append((x,c.max()))
            g=gray[:,x].astype(float); g=np.convolve(g,np.ones(5)/5,'same'); d=g[4:]-g[:-4]
            lo=max(5,int(y0-0.3*(y1-y0))); hi=int(y0+0.35*(y1-y0))
            T.append((x,lo+int(np.argmin(d[lo:hi]))+2))
    T=np.array(T);Bt=np.array(Bt)
    kt,ct=rfit(T[:,0],T[:,1]); kb,cb=rfit(Bt[:,0],Bt[:,1])
    def inter(kv,cv,kh,ch):  # x=kv*y+cv, y=kh*x+ch
        y=(kh*cv+ch)/(1-kh*kv); return [kv*y+cv,y]
    raw[i]=[inter(kl,cl,kt,ct),inter(kr,cr,kt,ct),inter(kr,cr,kb,cb),inter(kl,cl,kb,cb)]
out={}
for a,b in [(35,88),(89,121)]:
    fr=np.arange(a,b+1); P=np.array([raw[i] for i in fr],float)
    for c in range(4):
        for k in range(2):
            co=np.polyfit(fr,P[:,c,k],3)
            for _ in range(3):
                res=np.abs(P[:,c,k]-np.polyval(co,fr)); ok=res<max(2,np.median(res)*3); co=np.polyfit(fr[ok],P[ok,c,k],3)
            P[:,c,k]=np.polyval(co,fr)
    for j,i in enumerate(fr): out[int(i)]=P[j].tolist()
json.dump({'raw':raw,'smooth':out},open(f'{S}/quads.json','w'))
for i in [35,60,88,89,105,121]: print(i,[[round(x) for x in c] for c in raw[i]],[[round(x) for x in c] for c in out[i]])
