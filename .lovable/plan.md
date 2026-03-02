

## Analysis: Resync Button vs Auto-Sync

These are actually **two different operations**:

| | Auto-Sync (on edit) | Resync Button |
|---|---|---|
| **What it does** | Updates individual fields (price, title) via `shopify-update-product` | Re-pushes the **entire product** to Shopify via `v2-shopify-send-graded/raw` |
| **When it runs** | Automatically after every field edit | Only on manual click |
| **Use case** | Normal edits | Fixing data mismatches, re-uploading barcode/images, recovering from partial syncs |

The Resync button is a **recovery/repair tool**, not a normal workflow step. Auto-sync handles the day-to-day edits, but Resync is a safety net for when things get out of sync.

## Recommendation

Rather than removing it entirely (you'd lose the ability to fix broken syncs), **de-emphasize it**:

1. Remove the "Resync" button from the `InventoryItemActionsRow` (the card action buttons) — this is where it clutters the UI
2. Keep it only in the Inspector's **Shopify tab** as a secondary/ghost button labeled "Full Resync" — a power-user tool for troubleshooting
3. Remove it from the Inspector footer bar (where it currently sits as a primary action)

This cleans up the main UI while preserving the repair capability in a logical place (the Shopify details tab).

### Files to change:
- **`src/components/inventory-card/InventoryItemActionsRow.tsx`** — Remove the Resync button block
- **`src/features/inventory/components/inspector/InspectorPanel.tsx`** — Remove Resync from the footer bar
- **`src/features/inventory/components/inspector/tabs/ShopifyTab.tsx`** — Keep the Resync button here, restyle as ghost/secondary

