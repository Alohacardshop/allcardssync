

## Problem
The `v2-shopify-send-graded` edge function fails to boot with: `Identifier 'variant' has already been declared at line 320`.

There are two conflicting declarations of `variant` in the same function scope:
- **Line 104**: `const variant` — the card variant string (e.g., "1st Edition", "Normal")
- **Line 366**: `let product, variant` — the Shopify API variant object

## Fix
Rename the card variant variable on line 104 from `variant` to `cardVariant`, and update all references to it (lines 120, 254, 258):

1. **Line 104**: `const variant` → `const cardVariant`
2. **Line 120**: `if (variant && variant !== 'Normal')` → `if (cardVariant && cardVariant !== 'Normal')`
3. **Line 254**: `if (variant)` → `if (cardVariant)`
4. **Line 258**: `value: variant` → `value: cardVariant`

Then redeploy `v2-shopify-send-graded`.

No other files need changes. The Shopify `variant` on line 366 remains as-is since it refers to the product variant object returned by the Shopify API.

