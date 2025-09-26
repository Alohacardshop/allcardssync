import { describe, it, expect } from 'vitest';
import { sanitizeLabel, ensurePQ1 } from '../sanitizeZpl';

describe('sanitizeZpl', () => {
  it('should remove replicate parameters from ^PQ commands', () => {
    const zpl = '^XA\n^FO10,10^A0N,24,24^FDTEST^FS\n^PQ1,1,0,Y\n^XZ';
    const result = ensurePQ1(zpl);
    expect(result).toContain('^PQ1');
    expect(result).not.toContain('^PQ1,1,0,Y');
  });

  it('should ensure exactly one ^XZ terminator', () => {
    const zpl = '^XA\n^FO10,10^A0N,24,24^FDTEST^FS\n^PQ1\n^XZ\n\n';
    const result = sanitizeLabel(zpl);
    expect(result.match(/\^XZ/g)).toHaveLength(1);
    expect(result.trim().endsWith('^XZ')).toBe(true);
  });

  it('should include proper media handling commands', () => {
    const zpl = '^XA\n^FO10,10^A0N,24,24^FDTEST^FS\n^PQ1\n^XZ';
    const result = sanitizeLabel(zpl);
    expect(result).toContain('^MMT');
    expect(result).toContain('^MNY');
  });

  it('should maintain exactly one ^PQ command with copies=1', () => {
    const zpl = '^XA\n^FO10,10^A0N,24,24^FDTEST^FS\n^XZ';
    const result = sanitizeLabel(zpl);
    const pqMatches = result.match(/\^PQ\d+/g);
    expect(pqMatches).toHaveLength(1);
    expect(pqMatches?.[0]).toBe('^PQ1');
  });
});