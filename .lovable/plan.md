

## Relabel "Variant" to "Condition" for Raw Cards in the Overview Tab

The `variant` field on raw Pokémon cards already stores condition values like "Near Mint - Foil". The variant is also already included in titles across all `generateTitle` functions and in the Shopify edge function (`v2-shopify-send-raw`). So the data and title logic are correct -- the only change needed is a UI label update.

### Changes

**1. `src/features/inventory/components/inspector/tabs/OverviewTab.tsx`**
- Change the `EditableField` label from "Variant" to "Condition" when the item is a raw card (`item.type !== 'Graded'` or no grading company)
- Logic: `label={isRaw ? "Condition" : "Variant"}` where `isRaw = !item.grade || item.type?.toLowerCase() === 'raw'`

That's the only change needed. The condition value is already shown in titles in:
- All `generateTitle` functions (InspectorPanel, InventoryTableView, ItemDetailsDrawer, InventoryItemCard, EditIntakeItemDialog) -- variant is already appended to the title parts
- Shopify sync (`v2-shopify-send-raw/index.ts` line 148-151) -- already uses `intakeItem.variant` as condition in the title
- eBay sync processor -- uses the same title

No database changes, no edge function changes, no title logic changes required.

