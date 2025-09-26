// Guarantees a valid single-label block with ^XA…^XZ and ^PQ1
function insertAfterXA(z: string, cmd: string) {
  return z.includes(cmd) ? z : z.replace(/\^XA(\s*)/, (m, sp) => `^XA${sp}${cmd}\n`);
}

export function ensurePQ1(zpl: string) {
  return /\^PQ\d+/.test(zpl) ? zpl : zpl.replace(/\^XZ\s*$/m, "^PQ1\n^XZ");
}

export function sanitizeLabel(zpl: string) {
  let out = (zpl || "").trim();
  if (!out.startsWith("^XA")) out = "^XA\n" + out;
  if (!/\^XZ\s*$/.test(out)) out = out + "\n^XZ";
  
  // normalize top/home; keep user ^PW/^LL as-is
  out = insertAfterXA(out, "^LT0");
  out = insertAfterXA(out, "^LH0,0");
  
  return ensurePQ1(out);
}
