// Bundle a TS module to an importable data URL so tests can exercise real source.
import { build } from 'esbuild';
export async function loadModule(entry) {
  const out = await build({
    entryPoints: [new URL(entry, import.meta.url).pathname],
    bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022',
    logLevel: 'silent',
  });
  const code = out.outputFiles[0].text;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
