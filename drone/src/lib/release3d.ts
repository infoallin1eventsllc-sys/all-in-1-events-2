import * as THREE from 'three';
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';

/**
 * Free everything a 3D view put on the GPU when it unmounts: every geometry and
 * material in the scene and every texture those materials use (maps and shader
 * uniforms alike), the environment and background, the post-processing passes
 * (EffectComposer.dispose frees only its own targets), anything else handed in,
 * and finally the WebGL context itself. Browsers cap live contexts (Chrome at
 * 16) and drop the oldest when a new one is made, so a context left for the
 * garbage collector can blank a view that is still on screen.
 */
export function release3d(scene: THREE.Scene, renderer: THREE.WebGLRenderer, composer?: EffectComposer | null, extra: ({ dispose(): void } | null | undefined)[] = []) {
  const textures = new Set<THREE.Texture>(), materials = new Set<THREE.Material>();
  const isTex = (v: unknown): v is THREE.Texture => !!v && (v as THREE.Texture).isTexture === true;
  scene.traverse(o => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mm = m.material as THREE.Material | THREE.Material[] | undefined;
    for (const x of Array.isArray(mm) ? mm : mm ? [mm] : []) materials.add(x);
  });
  for (const m of materials) {
    for (const v of Object.values(m)) if (isTex(v)) textures.add(v);
    const uniforms = (m as THREE.ShaderMaterial).uniforms;
    if (uniforms) for (const u of Object.values(uniforms)) if (isTex(u?.value)) textures.add(u.value);
    m.dispose();
  }
  if (isTex(scene.environment)) textures.add(scene.environment);
  if (isTex(scene.background)) textures.add(scene.background);
  textures.forEach(t => t.dispose());
  if (composer) { for (const p of composer.passes) (p as { dispose?: () => void }).dispose?.(); composer.dispose(); }
  for (const e of extra) e?.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
}
