// ---- hoodie display forms wearing the owner's designs (decals lifted from his photos) ----
function hoodieForm(x, z, o) {
  const G = new THREE.Group(); G.position.set(x, o.y0, z); G.rotation.y = o.ry === undefined ? PI : o.ry; scene.add(G);
  const col = new THREE.Color().setRGB(o.fab[0] / 255, o.fab[1] / 255, o.fab[2] / 255, THREE.SRGBColorSpace);
  if (!hoodieForm.weave) { const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d"), d = g.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = 205 + Math.floor(Math.random() * 50); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } g.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5); t.colorSpace = THREE.SRGBColorSpace; hoodieForm.weave = t; }
  const fab = new THREE.MeshStandardMaterial({ color: col, roughness: 1, map: hoodieForm.weave, bumpMap: hoodieForm.weave, bumpScale: 0.6 });
  const rib = fab.clone(); rib.color = col.clone().multiplyScalar(0.82);
  const add = (geo, mat, px, py, pz, sx = 1, sy = 1, sz = 1, parent = G) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const RX = 0.25, RZ = 0.135, Y0 = 0.94, Y1 = 1.5, rAt = (y) => 0.94 + (y - Y0) / (Y1 - Y0) * 0.06;
  // stand
  add(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 40), M.steel, 0, 0.01, 0); add(new THREE.CylinderGeometry(0.016, 0.016, 0.95, 16), M.steel, 0, 0.475, 0);
  // body, hem, shoulders
  add(new THREE.CylinderGeometry(1, 0.94, Y1 - Y0, 48, 1), fab, 0, (Y0 + Y1) / 2, 0, RX, 1, RZ);
  add(new THREE.CylinderGeometry(0.93, 0.9, 0.075, 48, 1), rib, 0, Y0 - 0.03, 0, RX, 1, RZ);
  add(new THREE.SphereGeometry(1, 40, 20), fab, 0, Y1 - 0.004, 0, RX, 0.07, RZ);
  // hood: stands open behind the neck, dark inside
  { const inside = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.22), roughness: 1 });
    add(new THREE.SphereGeometry(1, 40, 24), fab, 0, Y1 + 0.095, -0.03, 0.142, 0.185, 0.125);
    const op = add(new THREE.CircleGeometry(1, 40), inside, 0, Y1 + 0.105, 0.0885, 0.09, 0.122, 1); op.rotation.x = -0.2; op.castShadow = false;
    const rm = add(new THREE.TorusGeometry(1, 0.15, 14, 48), fab, 0, Y1 + 0.105, 0.086, 0.094, 0.126, 0.07); rm.rotation.x = -0.2;
    add(new THREE.SphereGeometry(1, 32, 16), fab, 0, Y1 - 0.005, 0.05, 0.13, 0.05, 0.085); }
  // drawstrings: follow the cords in the product photo so they sit where the photo has them
  const cordM = o.cord ? sm(o.cord, 0.9) : rib, up = new THREE.Vector3(0, 1, 0);
  const seg = (A, B, r, mat) => { const d = B.clone().sub(A), m = add(new THREE.CylinderGeometry(r, r, d.length(), 8), mat, 0, 0, 0); m.position.copy(A).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(up, d.normalize()); };
  const dcl = o.decal ? { W: o.decal.width, H: o.decal.height, dw: o.dw, dh: o.dw * o.decal.height / o.decal.width, yc: o.dy || 1.325, a: Math.asin(Math.min(0.98, o.dw / 2 / RX)) } : null;
  const onBody = (px, py, lift) => { const th = -dcl.a + 2 * dcl.a * px / dcl.W, y = Math.min(Y1 + 0.03, dcl.yc + dcl.dh / 2 - py * dcl.dh / dcl.H), r = rAt(Math.min(Y1, y)) + lift;
    const pull = y > Y1 - 0.02 ? 1 - Math.min(1, (y - (Y1 - 0.02)) / 0.05) * 0.45 : 1; return new THREE.Vector3(RX * r * Math.sin(th), y, RZ * r * Math.cos(th) * pull); };
  (o.cords || []).forEach((line) => { const P = line.map(([px, py]) => onBody(px, py, 0.026)); for (let i = 0; i < P.length - 1; i++) seg(P[i], P[i + 1], i === P.length - 2 ? 0.0062 : 0.0068, i === P.length - 2 ? M.steel : cordM); });
  // kangaroo pocket (a tapered panel that follows the body)
  { const yb = 0.97, yt = 1.145, a = 0.62; add(new THREE.CylinderGeometry(rAt(yt) + 0.018, rAt(yb) + 0.03, yt - yb, 24, 1, true, -a * 0.82, a * 1.64), fab, 0, (yb + yt) / 2, 0, RX, 1, RZ);
    add(new THREE.CylinderGeometry(rAt(yt) + 0.02, rAt(yt) + 0.02, 0.008, 24, 1, true, -a * 0.82, a * 1.64), rib, 0, yt, 0, RX, 1, RZ); }
  // sleeves
  const sl = {};
  for (const s of [-1, 1]) { const tilt = s * 0.085, top = new THREE.Vector3(s * (RX + 0.004), Y1 - 0.062, 0), L = 0.6;
    const arm = new THREE.Group(); arm.position.copy(top); arm.rotation.z = tilt; G.add(arm);
    add(new THREE.SphereGeometry(0.071, 24, 16), fab, 0, 0, 0, 1, 1, 0.95, arm);
    add(new THREE.CylinderGeometry(0.071, 0.056, L, 24, 1), fab, 0, -L / 2, 0, 1, 1, 0.92, arm);
    add(new THREE.CylinderGeometry(0.051, 0.048, 0.07, 24, 1), rib, 0, -L - 0.03, 0, 1, 1, 0.92, arm); sl[s] = arm; }
  // chest print wrapped onto the body
  if (o.decal) { const t = new THREE.Texture(o.decal); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true;
    const dw = o.dw, dh = dw * o.decal.height / o.decal.width, yc = o.dy || 1.325, a = Math.asin(Math.min(0.98, dw / 2 / RX));
    const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    add(new THREE.CylinderGeometry(rAt(yc + dh / 2) + 0.012, rAt(yc - dh / 2) + 0.012, dh, 40, 1, true, -a, 2 * a), m, 0, yc, 0, RX, 1, RZ).castShadow = false; }
  // sleeve lettering
  if (o.sleeve) { const c = document.createElement("canvas"); c.width = 160; c.height = 640; const g = c.getContext("2d"); g.translate(80, 320); g.rotate(o.sleeve.up ? -PI / 2 : PI / 2);
    g.font = "800 112px Montserrat, Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#f4f3ef"; const tw = g.measureText(o.sleeve.t).width; if (tw > 600) g.scale(600 / tw, 1); g.fillText(o.sleeve.t, 0, 6);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const h = 0.4, y = -0.33, r = (yy) => 0.071 + (0.056 - 0.071) * (-yy / 0.6) + 0.004;
    const p = add(new THREE.CylinderGeometry(r(y + h / 2), r(y - h / 2), h, 20, 1, true, 0.5 - 0.62, 1.24), m, 0, y, 0, 1, 1, 0.92, sl[1]); p.castShadow = false; }
  return G;
}
