---
name: img2threejs
description: "Turn an image, floor plan, sketch, or verbal description into an interactive 3D scene rendered in the connected Three.js 3D Viewer. Use it whenever Otis shares a venue photo, lounge sketch, stage or truss diagram, floor plan, or product shot and wants it in 3D — or asks for a 3D layout, walkthrough, scene, or spatial mockup even with no image at all. Covers the viewer's exact call contract, a scene-building method (measure, block, light, orbit), and event-production recipes: lounge sets, uplighting, booths, stages at real-world scale. Skip it for 2D design work, charts, and anything with no spatial component."
---

# img2threejs — image to interactive 3D scene

Converts visual input (a photo, plan, sketch, or described space) into a live
Three.js scene through the **Three.js 3D Viewer** connector. Primary use:
event-production spatial work — venue layouts, VIP lounge configurations,
stage and lighting mockups a client can orbit.

## The tool contract (verified 2026-08-29)

Call `mcp__Three_js_3D_Viewer__show_threejs_scene` with `code` (JS string)
and optional `height` (px, default 400). The code runs with these globals —
nothing else is importable:

`THREE` · `OrbitControls` · `EffectComposer` · `RenderPass` ·
`UnrealBloomPass` · `canvas` · `width` · `height`

Construct the renderer on the provided `canvas`:
`new THREE.WebGLRenderer({ canvas, antialias: true })`, then
`renderer.setSize(width, height)`. `alpha: true` + `setClearColor(0x…, 0)`
gives a transparent background that composites with the host UI.
`learn_threejs` returns the viewer's own docs when something beyond this
contract is needed. If the connector is missing from a session it likely
needs enabling, not installing — check per `meridian-stack` before declaring
it absent.

**Constraints that shape everything:** assume no external asset loading —
no texture URLs, no GLTF fetches. Build with procedural geometry
(Box/Cylinder/Plane/Extrude), `MeshStandardMaterial` color/emissive/
roughness/metalness, and lights. That constraint is fine for layout work,
wrong for photoreal — say so instead of overpromising.

## Method: measure → block → light → orbit

1. **Measure.** Fix a scale before any geometry: 1 unit = 1 meter. From an
   image, anchor on a known dimension (a doorway ≈ 0.9×2.1m, a sofa ≈ 2.2m,
   ceiling ≈ 3–5m for venues) and derive the rest proportionally. From a
   floor plan, read the dimensions off the plan. Never eyeball a scene
   unanchored — everything downstream inherits the error.
2. **Block.** Floor plane first, then a `GridHelper` at 1m cells so scale
   stays legible. Add objects as grouped primitives at real dimensions —
   a sofa is two boxes, a table is a cylinder, truss is thin boxes. Name the
   helper functions after the real objects (`sofa()`, `ledTable()`,
   `boothWall()`) so the scene reads as an inventory.
3. **Light like the event, not like a demo.** Lighting IS the product in
   event work: emissive materials + `PointLight` for LED furniture,
   `SpotLight` cones from floor level for uplighting, low `AmbientLight`
   (dark venues ≈ 0.5–0.7), one soft directional key with shadows on.
   Brand the light: pull hexes from `meridian-stack`'s tokens (orchid
   `0xecb2ff`, cyan `0x00eefc` for All in 1 Events), never invent colors.
   `UnrealBloomPass` via `EffectComposer` when glow is the point.
4. **Orbit.** Always end with `OrbitControls` targeted at the scene's
   center of interest, camera placed high-oblique (roughly x=0.6·room,
   y=0.75·room, z=1.1·room), and a `requestAnimationFrame` loop calling
   `controls.update()`. A scene nobody can orbit is a screenshot with
   extra steps.

## Reading an image into a scene

- Treat the image as a **layout authority, not a texture source**: extract
  object positions, counts, orientations and the traffic flow, then rebuild
  with primitives at true scale.
- List the inventory out loud before coding ("4 sofas in an L, 3 cocktail
  tables center, booth on north wall, bar east") — Otis corrects a list
  faster than a render.
- Unknowns render as placeholders, per house rules: a flat gray box with
  the right footprint beats a guessed detail. Say what was assumed.
- For real venue engineering (rigging weight, sight lines, CAD handoff),
  this is a sketch tool — route to Trimble SketchUp (`build_model`) when
  available; see `meridian-stack`.

## Recipe fragments (tested)

```js
// LED cocktail table, branded glow
const t = new THREE.Mesh(
  new THREE.CylinderGeometry(0.35, 0.3, 1.05, 24),
  new THREE.MeshStandardMaterial({ color: 0x111317, emissive: 0xecb2ff, emissiveIntensity: 1.4 })
);
scene.add(t, Object.assign(new THREE.PointLight(0xecb2ff, 3, 4), { position: new THREE.Vector3(x, 1, z) }));

// wall uplight
const up = new THREE.SpotLight(0xbd00ff, 8, 7, Math.PI / 7, 0.5);
up.position.set(x, 0.1, z); up.target.position.set(x, 5, z);
scene.add(up, up.target);
```

## Definition of done

The scene orbits smoothly; scale is anchored and gridded; lighting matches
the event's actual design language; every object traces to the source image
or a stated assumption; and the reply names what was simplified.
