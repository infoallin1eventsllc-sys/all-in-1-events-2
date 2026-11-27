// ---- scale figures: neutral, architect's-model people so the rooms read as in use ----
{
  const tone = { visitor: sm(0xd6d2c8, 1), staff: sm(0x35423b, 1) }, list = [];
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 14);
  const G = { leg: cap(0.07, 0.66), torso: cap(0.15, 0.4), arm: cap(0.045, 0.5), head: new THREE.SphereGeometry(0.1, 20, 14), thigh: cap(0.07, 0.34), shin: cap(0.065, 0.36), fore: cap(0.045, 0.4) };
  const person = (x, z, y0, ry, kind = "visitor", pose = "stand", seat = 0.46) => {
    const g = new THREE.Group(), m = tone[kind]; g.position.set(x, y0, z); g.rotation.y = ry; scene.add(g); list.push({ x, y: y0, z });
    const add = (geo, px, py, pz, rx = 0, rz = 0, sz = 1) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.rotation.set(rx, 0, rz); o.scale.z = sz; o.castShadow = true; o.receiveShadow = true; g.add(o); };
    if (pose === "stand") {
      for (const s of [-1, 1]) { add(G.leg, s * 0.085, 0.4, 0); add(G.arm, s * 0.215, 1.12, 0.01, 0.04, -s * 0.07); }
      add(G.torso, 0, 1.13, 0, 0, 0, 0.68); add(G.head, 0, 1.6, 0.01);
    } else {
      const h = seat + 0.07;
      for (const s of [-1, 1]) { add(G.thigh, s * 0.085, h, 0.2, PI / 2); add(G.shin, s * 0.085, h - 0.25, 0.42); add(G.fore, s * 0.2, h + 0.38, 0.14, -0.95, -s * 0.05); }
      add(G.torso, 0, h + 0.4, 0, 0.06, 0, 0.68); add(G.head, 0, h + 0.87, 0.04);
    }
  };
  // lobby
  person(0.9, 4.72, 0, 0, "staff"); person(-4.22, 10.0, 0, PI / 2, "visitor", "sit", 0.42);
  // dispensary: two budtenders behind the counter, a customer at it, one seated by the window
  person(-15, 3.42, 0, 0, "staff"); person(-10.4, 3.42, 0, 0, "staff"); person(-12.3, 5.55, 0, PI, "visitor"); person(-18, 11.1, 0, PI, "visitor", "sit", 0.44);
  // veg room: a grower at the big bench
  person(-8.5, -1.45, 0, 0, "staff");
  // fulfilment: packers at the tables
  person(10.5, -7.5, 0, 0, "staff"); person(16.5, -7.5, 0, 0, "staff");
  // merch: a shopper at the hoodie wall, staff at the till
  person(18.55, 4.3, 0, PI / 2, "visitor"); person(5.62, 6.5, 0, PI / 2, "staff");
  // content studio: talent on the white stage, an operator at the control desk, two podcast hosts
  person(-17.5, 7, F2, PI / 2, "visitor"); person(-14.8, 3.6, F2, PI, "staff"); person(-7.6, 6.42, F2, 0, "visitor", "sit"); person(-7.6, 9.58, F2, PI, "visitor", "sit");
  // edit bay and lounge
  person(14.8, 3.74, F2, PI, "staff", "sit"); person(17.4, 3.74, F2, PI, "staff", "sit"); person(9.25, 11.02, F2, PI, "visitor", "sit", 0.42);
  globalThis.__people = list;
}
