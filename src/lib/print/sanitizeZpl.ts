// Guarantees a valid single-label block with ^XA…^XZ and ^PQ1
function insertAfterXA(z: string, cmd: string) {
  return z.includes(cmd) ? z : z.replace(/\^XA(\s*)/, (m, sp) => `^XA${sp}${cmd}\n`);
}

export function ensurePQ1(zpl: string) {
  // Remove any ^PQ commands with replicate parameters that cause extra advances
  let cleaned = zpl.replace(/\^PQ\d+,\d+,\d+,\w+/g, (match) => {
    const qty = match.match(/\^PQ(\d+)/)?.[1] || '1';
    return `^PQ${qty}`;
  });
  
  // Only add ^PQ1 if no ^PQ command exists at all - preserve existing quantities
  return /\^PQ\d+/.test(cleaned) ? cleaned : cleaned.replace(/\^XZ\s*$/m, "^PQ1\n^XZ");
}

export function sanitizeLabel(zpl: string) {
  let out = (zpl || "").trim();
  if (!out.startsWith("^XA")) out = "^XA\n" + out;
  
  // Ensure exactly one ^XZ at end, strip trailing whitespace
  out = out.replace(/\^XZ\s*$/m, "").trim() + "\n^XZ";
  
  // Force sane media handling - tear-off mode and gap sensing
  out = insertAfterXA(out, "^MMT");  // Tear-off (avoid auto-advance)
  out = insertAfterXA(out, "^MNY");  // Web/gap sensing mode
  
  // normalize top/home; keep user ^PW/^LL as-is  
  out = insertAfterXA(out, "^LT0");
  out = insertAfterXA(out, "^LH0,0");
  
  const result = ensurePQ1(out);
  
  // Preflight log (debug)
  const lastChars = result.slice(-20);
  console.debug("[zpl_preflight]", { 
    length: result.length, 
    lastChars: lastChars.replace(/\n/g, "\\n"),
    endsWithXZ: /\^XZ$/.test(result.trim())
  });
  
  return result;
}
