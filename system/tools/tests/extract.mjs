// Pull verifyStripeSignature out of the real edge-function source at run time.
//
// A committed copy of the function would pass its tests forever while the
// deployed one drifted away from it. Extracting from _shared/stripe.ts on
// every run means the thing under test is always the thing that ships; if the
// source stops parsing this way, the test fails loudly rather than quietly
// checking a stale duplicate.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SRC = new URL('../../supabase/functions/_shared/stripe.ts', import.meta.url).pathname;

export async function loadVerifier() {
  const src = readFileSync(SRC, 'utf8');
  const start = src.indexOf('const toHex =');
  if (start === -1) throw new Error('could not find the signature block in stripe.ts');

  let body = src.slice(start)
    .replace('(b: ArrayBuffer)', '(b)')
    .replace('(a: string, b: string): boolean', '(a, b)')
    .replace(/export type SignatureCheck = \{[^}]*\};/, '')
    .replace(`  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<SignatureCheck> {`, `  payload,
  header,
  secret,
  toleranceSeconds = 300,
) {`)
    .replace('const signatures: string[] = [];', 'const signatures = [];');

  if (/:\s*(string|number|boolean|ArrayBuffer|Promise<)/.test(body)) {
    throw new Error('type annotations survived stripping — the extractor needs updating');
  }

  const dir = mkdtempSync(join(tmpdir(), 'sigtest-'));
  const file = join(dir, 'verify.mjs');
  writeFileSync(file, body);
  return await import(file);
}
