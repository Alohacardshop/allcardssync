

## Confirmation: Graded Comics Are Not Affected

The approved plan's weight change is already scoped to cards only. Here's the existing logic:

```typescript
weight: isComic ? 1.5 : (intakeItem.product_weight || 3)
//       ↑ comics: 1.5 lb    ↑ cards only: changing 3 → 3.5 oz
```

The `isComic` check fires first for any item where `main_category === 'comics'` or `catalog_snapshot.type === 'graded_comic'`, sending them down the `1.5 lb` path. The `3 → 3.5` change only hits the `else` branch (cards).

**No changes needed beyond what was already approved.** The plan is safe to implement as-is.

