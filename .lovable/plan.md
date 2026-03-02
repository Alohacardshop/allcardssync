

## Streamline "Send to Inventory" Flow

### Current Problems

1. **Confusing terminology**: Dialog says "Batch Send Configuration" and references "Shopify API usage" — but the user action is sending items to inventory. Shopify sync happens automatically afterward.
2. **Duplicate vendor selector**: Vendor is already selected in the batch panel header, then shown again in the dialog.
3. **Too many technical knobs exposed**: Batch size, delay between chunks, fail fast mode are implementation details. Most users should never need to touch these.
4. **Button says "Manual Configure"**: Unclear what this does — it just means "proceed."
5. **No simple one-click path**: Every send requires opening a dialog and configuring settings that rarely change.

### Proposed Changes

**File: `src/components/BatchConfigDialog.tsx`**

- Rename title to **"Send to Inventory"** with description: "Items will be added to inventory and automatically synced to Shopify."
- Remove the vendor selector from the dialog — use the vendor already selected in the panel header (passed via `initialVendor`).
- Move Batch Size, Delay, and Fail Fast into a collapsible **"Advanced Settings"** section (using `Collapsible` from Radix) — collapsed by default.
- Change primary button from "Manual Configure" to **"Send {count} Items"** with a `Send` icon.
- Keep the Processing Summary card at top.

**File: `src/components/CurrentBatchPanel.tsx`**

- Ensure `initialVendor` is always passed from the panel's `selectedVendor` state (already done).
- No other changes needed here.

### Result

The typical flow becomes: click "Send to Inventory" → see summary → click "Send 5 Items". Advanced users can expand the settings section if needed. No duplicate vendor picker, no Shopify jargon.

