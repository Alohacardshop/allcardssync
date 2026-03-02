

## Remove Redundant "Batch Send to Shopify" Button

The `BatchConfigDialog` component always renders a trigger button ("Batch Send to Shopify") via `DialogTrigger`, even when the dialog is controlled externally through `open`/`onOpenChange` props. Since the "Send to Inventory" button in the `CurrentBatchPanel` header already opens this dialog, the bottom button is redundant and confusing.

### Fix

**File: `src/components/BatchConfigDialog.tsx`**

When `externalOpen` is provided (meaning the dialog is controlled externally), skip rendering the `DialogTrigger` entirely. Only render the `DialogContent`.

Change the return JSX so that:
- If `externalOpen !== undefined` (externally controlled), render `<Dialog>` with just `<DialogContent>` — no `<DialogTrigger>`
- If internally controlled (no external open prop), keep the existing trigger button behavior

This removes the floating green button at the bottom of the intake page while keeping the dialog functional when opened via "Send to Inventory".

