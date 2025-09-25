// zplUtils.ts
export function assertSingleFormat(zpl: string) {
  const xa = (zpl.match(/\^XA/g) || []).length;
  const xz = (zpl.match(/\^XZ/g) || []).length;
  if (xa !== 1 || xz !== 1) {
    const preview = zpl.slice(0, 200).replace(/\n/g, "\\n");
    throw new Error(`ZPL must contain exactly one ^XA and one ^XZ (got ^XA=${xa}, ^XZ=${xz}). Preview: ${preview}`);
  }
}

export function ensurePQ1(zpl: string) {
  // Ensure ^PQ exists and is set to 1 just before ^XZ
  // If ^PQ is already present anywhere, leave it as-is; otherwise inject.
  const hasPQ = /\^PQ\d+/.test(zpl);
  if (hasPQ) return zpl;
  return zpl.replace(/\^XZ\s*$/m, "^PQ1\n^XZ");
}

function idempotentlyInsertAfterXA(zpl: string, cmd: string) {
  // Insert immediately after ^XA unless already present anywhere
  if (zpl.includes(cmd)) return zpl;
  return zpl.replace(/\^XA\s*/, match => match + cmd + "\n");
}

export function applySafeProfile(zpl: string, enabled: boolean) {
  if (!enabled) return zpl;
  const commands = ["^LT0", "^LH0,0", "^PR2", "^MD6", "~SD10"];
  let out = zpl;
  for (const c of commands) out = idempotentlyInsertAfterXA(out, c);
  return out;
}

export async function sha1Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-1", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}