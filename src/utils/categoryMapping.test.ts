/**
 * Tests for smart category detection with special characters
 * These tests ensure PSA, CGC, and other API data is properly categorized
 */

import { describe, it, expect } from 'vitest';
import { detectMainCategory } from './categoryMapping';

describe('detectMainCategory - Smart Matching', () => {
  describe('TCG Detection', () => {
    it('should detect Pokemon with accent', () => {
      expect(detectMainCategory('Pokémon')).toBe('tcg');
    });

    it('should detect Pokemon without accent', () => {
      expect(detectMainCategory('Pokemon')).toBe('tcg');
    });

    it('should detect Pokemon with mixed case and spaces', () => {
      expect(detectMainCategory('POKEMON Base Set')).toBe('tcg');
      expect(detectMainCategory('  pokemon  ')).toBe('tcg');
    });

    it('should detect Magic variations', () => {
      expect(detectMainCategory('Magic the Gathering')).toBe('tcg');
      expect(detectMainCategory('Magic: The Gathering')).toBe('tcg');
      expect(detectMainCategory('MTG')).toBe('tcg');
      expect(detectMainCategory('M:TG')).toBe('tcg');
    });

    it('should detect Yu-Gi-Oh variations', () => {
      expect(detectMainCategory('Yu-Gi-Oh!')).toBe('tcg');
      expect(detectMainCategory('Yugioh')).toBe('tcg');
      expect(detectMainCategory('Yu Gi Oh')).toBe('tcg');
      expect(detectMainCategory('YGO')).toBe('tcg');
    });

    it('should detect other TCG games', () => {
      expect(detectMainCategory('Disney Lorcana')).toBe('tcg');
      expect(detectMainCategory('One Piece Card Game')).toBe('tcg');
      expect(detectMainCategory('Dragon Ball Super')).toBe('tcg');
    });
  });

  describe('Sports Detection', () => {
    it('should detect baseball', () => {
      expect(detectMainCategory('Baseball')).toBe('sports');
      expect(detectMainCategory('Yankees')).toBe('sports');
      expect(detectMainCategory('MLB')).toBe('sports');
    });

    it('should detect basketball', () => {
      expect(detectMainCategory('Basketball')).toBe('sports');
      expect(detectMainCategory('Lakers')).toBe('sports');
      expect(detectMainCategory('NBA')).toBe('sports');
    });

    it('should detect football', () => {
      expect(detectMainCategory('Football')).toBe('sports');
      expect(detectMainCategory('NFL')).toBe('sports');
      expect(detectMainCategory('Cowboys')).toBe('sports');
    });
  });

  describe('Comics Detection', () => {
    it('should detect Marvel', () => {
      expect(detectMainCategory('Marvel')).toBe('comics');
      expect(detectMainCategory('Spider-Man')).toBe('comics');
      expect(detectMainCategory('X-Men')).toBe('comics');
    });

    it('should detect DC', () => {
      expect(detectMainCategory('DC Comics')).toBe('comics');
      expect(detectMainCategory('Batman')).toBe('comics');
      expect(detectMainCategory('Superman')).toBe('comics');
    });
  });

  describe('Edge Cases & Security', () => {
    it('should handle null/undefined gracefully', () => {
      expect(detectMainCategory('')).toBe('tcg');
      expect(detectMainCategory(null as any)).toBe('tcg');
      expect(detectMainCategory(undefined as any)).toBe('tcg');
    });

    it('should handle very long strings safely', () => {
      const longString = 'Pokemon'.repeat(100);
      expect(detectMainCategory(longString)).toBe('tcg');
    });

    it('should handle special characters in brand names', () => {
      expect(detectMainCategory('Pokémon™ Trading Cards')).toBe('tcg');
      expect(detectMainCategory('Magic: The Gathering®')).toBe('tcg');
    });

    it('should normalize unicode correctly', () => {
      expect(detectMainCategory('Pokémon')).toBe('tcg'); // é
      expect(detectMainCategory('Pokèmon')).toBe('tcg'); // è
      expect(detectMainCategory('Pokêmon')).toBe('tcg'); // ê
    });

    it('should default to TCG for unknown inputs', () => {
      expect(detectMainCategory('Unknown Game XYZ')).toBe('tcg');
      expect(detectMainCategory('Random Text 123')).toBe('tcg');
    });
  });

  describe('Real PSA/CGC API Data Examples', () => {
    it('should handle PSA brand format', () => {
      expect(detectMainCategory('1999 Pokemon Base Set')).toBe('tcg');
      expect(detectMainCategory('2021 Topps Chrome Baseball')).toBe('sports');
      expect(detectMainCategory('1962 Marvel Amazing Spider-Man')).toBe('comics');
    });

    it('should handle CGC brand format', () => {
      expect(detectMainCategory('Pokemon - Base Set')).toBe('tcg');
      expect(detectMainCategory('Magic the Gathering - Alpha')).toBe('tcg');
    });

    it('should handle data with extra whitespace', () => {
      expect(detectMainCategory('   Pokemon   Base   Set   ')).toBe('tcg');
      expect(detectMainCategory('\nMagic\tthe\rGathering\n')).toBe('tcg');
    });
  });
});
