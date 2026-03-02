

## Make Shopify Title Match Database Title & Add Variant

### Problem
The Shopify title differs from the database title shown in the UI:
- **DB/UI**: `2018-06 Marvel Comics Amazing Spider-Man #798 PSA 10` (normal case)
- **Shopify**: `2018-06 MARVEL COMICS AMAZING SPIDER-MAN #798 PSA 10` (uppercased brand & subject)
- **Variant** is missing from both — needs to be included

### Changes

**1. `supabase/functions/v2-shopify-send-graded/index.ts` (~lines 123-134)**
- Remove `.toUpperCase()` from `brandTitle` and `subject` in the title builder
- Add `cardVariant` to the title parts (after `#cardNumber`, before grade) — it's already extracted on line 114 but only conditionally used
- This makes the Shopify title match the DB display exactly

**2. `src/features/inventory/hooks/useInventoryFieldSync.ts` (~lines 54-65)**
- Add `variant` to the title-building logic so inline edits also include variant in the Shopify title
- Add `variant` to the trigger fields that cause a title resync

**3. `src/features/inventory/components/inspector/InspectorPanel.ts` (~line 40) and `src/features/inventory/components/ItemDetailsDrawer.tsx` (~line 40)**
- Add variant to `generateTitle()` after `#card_number` in both files so the UI display also shows variant

**4. Redeploy `v2-shopify-send-graded` edge function**

### Result
All three places (UI display, Shopify initial send, Shopify inline-edit sync) will produce identical titles like:
`2018-06 Marvel Comics Amazing Spider-Man #798 1st Red Goblin PSA 10`

