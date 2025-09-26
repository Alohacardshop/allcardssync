export const ensurePQ1 = (zpl: string) =>
  zpl.replace(/\^XZ\s*$/m, "").concat("\n^PQ1\n^XZ");