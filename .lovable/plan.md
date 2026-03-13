

## One Piece Card Game CSV Import — Issues & Fixes

### Problem

The user's CSV has `One Piece Card Game` as the Product Line. Two issues prevent smooth intake:

1. **`detectGameFromProductLine` missing One Piece** — the function (line 54-68 in `TCGPlayerBulkImport.tsx`) doesn't map "one piece" to a game identifier, so the sub-category won't auto-detect and the user gets "Please select a sub-category manually."

2. **Quantity in "Add to Quantity" column, not "Total Quantity"** — the user's CSV has quantity `1` in column 13 (`Add to Quantity`) and column 12 (`Total Quantity`) is empty. The parser already handles this fallback (lines 561-564 in `smartTcgplayerParser.ts`), so this should work correctly.

### Changes

**File: `src/components/TCGPlayerBulkImport.tsx`** (line ~63)

Add One Piece detection to `detectGameFromProductLine`:

```typescript
if (normalized.includes('one piece')) return 'onepiece';
```

That's it — one line. The CSV parser, quantity fallback, and category detection (`categoryMapping.ts` already has `'one piece'` in TCG_GAMES) all handle One Piece correctly. The parser will detect headers, map all 16 columns, and use `addQuantity` as the fallback when `Total Quantity` is empty.

### Result

After this change, pasting the One Piece CSV will auto-detect the game as "onepiece," set the main category to "tcg," and load all cards with quantity 1 and correct market prices.

