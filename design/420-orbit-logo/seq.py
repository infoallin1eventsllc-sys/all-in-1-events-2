import numpy as np, os, shutil
from PIL import Image
def load(i): return Image.open(f'cut/{i:04d}.png').convert('RGBA')
def bbox(im):
    a = np.asarray(im)[..., 3] > 128; ys, xs = np.nonzero(a); return xs.min(), xs.max(), ys.min(), ys.max()
A = list(range(70, 80)); B = list(range(105, 159))
b79, b105 = bbox(load(79)), bbox(load(105))
s = (b105[3]-b105[2])/(b79[3]-b79[2])
cx79, cy79 = (b79[0]+b79[1])/2, (b79[2]+b79[3])/2
cx105, cy105 = (b105[0]+b105[1])/2, (b105[2]+b105[3])/2
print('scale', round(s, 3))
def warp(im):
    # output(x,y) = input((x-cx105)/s+cx79, (y-cy105)/s+cy79)
    return im.transform(im.size, Image.AFFINE, (1/s, 0, cx79-cx105/s, 0, 1/s, cy79-cy105/s), resample=Image.BICUBIC)
frames = [warp(load(i)) for i in A]
mid = Image.blend(frames[-1], load(105), 0.5)
frames += [mid] + [load(i) for i in B]
x0 = min(bbox(f)[0] for f in frames); x1 = max(bbox(f)[1] for f in frames)
y0 = min(bbox(f)[2] for f in frames); y1 = max(bbox(f)[3] for f in frames)
m = 10; box = (max(0, x0-m), max(0, y0-m), min(720, x1+m), min(1020, y1+m)); print('box', box, 'n', len(frames))
shutil.rmtree('seq', ignore_errors=True); os.makedirs('seq')
for k, f in enumerate(frames): f.crop(box).save(f'seq/{k:03d}.png')
small = [f.crop(box).resize((round((box[2]-box[0])*0.72), round((box[3]-box[1])*0.72)), Image.LANCZOS) for f in frames]
small[0].save('orbit-logo.webp', save_all=True, append_images=small[1:], duration=42, loop=1, quality=78, method=4)
print('webp', os.path.getsize('orbit-logo.webp')//1024, 'KB', small[0].size)
