// Bundles the parts of Three.js the hologram uses into one file the panel can
// load without the internet:  npm run build:vendor  ->  web/vendor/three.js
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await build({
  stdin: {
    contents: `export { ACESFilmicToneMapping, AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide, EdgesGeometry, ExtrudeGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, LineSegments, MathUtils, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Points, PointsMaterial, Raycaster, RingGeometry, Scene, ShaderMaterial, Shape, ShapeGeometry, Spherical, TOUCH, Vector2, Vector3, WebGLRenderer } from "three";
export { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
export { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
export { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
export { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
export { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";`,
    resolveDir: root,
  },
  bundle: true,
  format: "esm",
  minify: true,
  target: "es2020",
  legalComments: "inline",
  outfile: path.join(root, "web/vendor/three.js"),
});
console.log("web/vendor/three.js");
