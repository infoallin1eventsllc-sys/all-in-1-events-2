// Gimbal tests: the camera holds the horizon whatever the airframe does, points where it is told
// (straight down for mapping, upright for portrait), and stops at its mechanical limits. Run with `npm test`.
import assert from 'assert';
import { loadModule } from './bundle.mjs';
const { THREE, aimGimbal, LIMIT } = await loadModule('./fixtures/gimbal-entry.ts');

/** An airframe with a yaw → roll → pitch chain hung under it, as buildDrone makes. */
function rig() {
  const body = new THREE.Group(), yaw = new THREE.Group(), roll = new THREE.Group(), pitch = new THREE.Group();
  yaw.position.set(0.39, -0.02, 0); roll.position.set(0.06, -0.06, 0);
  body.add(yaw); yaw.add(roll); roll.add(pitch);
  return { body, g: { yaw, roll, pitch } };
}
const axis = (o, x, y, z) => { o.updateWorldMatrix(true, false); return new THREE.Vector3(x, y, z).transformDirection(o.matrixWorld); };
const near = (a, b, msg, tol = 1e-3) => assert.ok(Math.abs(a - b) < tol, `${msg}: ${a.toFixed(4)} vs ${b.toFixed(4)}`);

// --- level airframe: straight down looks straight down -------------------------------------------
{
  const { body, g } = rig();
  aimGimbal(g, { tilt: -Math.PI / 2 });
  const f = axis(g.pitch, 1, 0, 0);
  near(f.y, -1, 'lens points down');
}

// --- a banking, pitching, turning airframe: the horizon holds ------------------------------------
for (const [r, p, h] of [[0.4, 0.2, 1.0], [-0.5, -0.3, -2.4], [0.2, 0.45, 3.0], [0, 0, 0.7]]) {
  const { body, g } = rig();
  body.rotation.set(p, h, r, 'YXZ');
  aimGimbal(g, { tilt: 0 });
  const f = axis(g.pitch, 1, 0, 0), up = axis(g.pitch, 0, 1, 0);
  near(f.y, 0, `lens level (roll ${r}, pitch ${p})`);
  near(up.y, 1, `picture upright (roll ${r}, pitch ${p})`);
  // and it looks along the aircraft's heading
  const nose = axis(body, 1, 0, 0); nose.y = 0; nose.normalize();
  near(f.dot(nose), 1, `looks along the heading (yaw ${h})`);
}

// --- tilt is exact through a bank ---------------------------------------------------------------
{
  const { body, g } = rig();
  body.rotation.set(0.3, 0.8, -0.35, 'YXZ');
  aimGimbal(g, { tilt: -0.3 });
  near(axis(g.pitch, 1, 0, 0).y, Math.sin(-0.3), 'tilted 0.3 rad down');
  aimGimbal(g, { tilt: -Math.PI / 2 });
  near(axis(g.pitch, 1, 0, 0).y, -1, 'straight down while banked', 2e-3);
}

// --- pan turns the view about the vertical --------------------------------------------------------
{
  const { body, g } = rig();
  aimGimbal(g, { pan: 0.5 });
  const f = axis(g.pitch, 1, 0, 0);
  near(Math.atan2(-f.z, f.x), 0.5, 'panned 0.5 rad');
}

// --- portrait: the camera turns upright about its lens axis ---------------------------------------
{
  const { body, g } = rig();
  body.rotation.set(0.15, 0, -0.2, 'YXZ');
  aimGimbal(g, { roll: -Math.PI / 2 });
  const f = axis(g.pitch, 1, 0, 0), side = axis(g.pitch, 0, 0, 1);
  near(f.y, 0, 'lens still level in portrait', 0.01);
  // Turned upright the tilt axis lines up with the pan axis (gimbal lock), so the airframe's pitch can only be
  // taken out by leaning the frame a little: it stays within a few degrees of upright.
  assert.ok(Math.abs(side.y) > Math.cos(0.25), `frame close to upright: ${Math.acos(Math.abs(side.y)).toFixed(3)} rad off`);
}
{
  const { body, g } = rig();
  aimGimbal(g, { roll: -Math.PI / 2 });
  const f = axis(g.pitch, 1, 0, 0), side = axis(g.pitch, 0, 0, 1);
  near(f.y, 0, 'level airframe, portrait: lens level', 2e-3);
  near(Math.abs(side.y), 1, 'level airframe, portrait: exactly upright', 2e-3);
  // Tilting while upright takes the frame off vertical (the same lock), but the lens still goes where it is told.
  aimGimbal(g, { roll: -Math.PI / 2, tilt: -0.1 });
  near(axis(g.pitch, 1, 0, 0).y, Math.sin(-0.1), 'portrait tilt: lens exact', 2e-3);
  assert.ok(Math.abs(axis(g.pitch, 0, 0, 1).y) > Math.cos(0.25), 'portrait tilt: frame close to upright');
}
// --- the answer is stable frame to frame (the last answer seeds the next) ----------------------------
{
  const { body, g } = rig();
  body.rotation.set(0.15, 0, -0.2, 'YXZ');
  aimGimbal(g, { roll: -Math.PI / 2 });
  const first = [g.yaw.rotation.y, g.roll.rotation.x, g.pitch.rotation.z];
  aimGimbal(g, { roll: -Math.PI / 2 });
  assert.deepEqual([g.yaw.rotation.y, g.roll.rotation.x, g.pitch.rotation.z].map(v => v.toFixed(4)), first.map(v => v.toFixed(4)), 'same pose twice');
}

// --- mechanical limits ------------------------------------------------------------------------------
{
  const { g } = rig();
  aimGimbal(g, { tilt: 1.5, pan: 2 });
  near(g.pitch.rotation.z, LIMIT.tilt[1], 'tilt up stops at its limit');
  near(g.yaw.rotation.y, LIMIT.pan, 'pan stops at its limit');
  aimGimbal(g, { tilt: -2.9 });
  near(g.pitch.rotation.z, LIMIT.tilt[0], 'tilt down stops at its limit');
  aimGimbal(g, { tilt: 0, roll: -2.8 });
  near(g.roll.rotation.x, LIMIT.roll[0], 'roll stops at its limit');
}

// --- no parent: a detached gimbal is left alone -----------------------------------------------------
{
  const yaw = new THREE.Group(), roll = new THREE.Group(), pitch = new THREE.Group(); yaw.add(roll); roll.add(pitch);
  aimGimbal({ yaw, roll, pitch }, { tilt: -1 });
  assert.equal(pitch.rotation.z, 0);
}

console.log('gimbal: all tests passed');
