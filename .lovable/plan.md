

## Assessment: Current "Send to Inventory" Flow

The recent changes (clean title, hidden advanced settings, no duplicate vendor) have already addressed the major UX issues. The dialog is now streamlined. Here's what remains worth improving:

### Remaining Issues

1. **No confirmation for large batches**: Sending 50+ items happens with a single click. Per your existing `ConfirmActionDialog` pattern and memory notes, batches over 10 items should require typed confirmation to prevent accidents.

2. **Per-item "Send to Inventory" button has no guard**: Each item row has a small Send icon button that immediately sends a single item with no confirmation at all — easy to misclick.

3. **Toast spam during chunked processing**: Each chunk fires its own success toast (`"Chunk 2/5 completed..."`). For a 50-item batch that's 10 toasts. Should consolidate to a single final summary toast.

4. **"Processing Summary" shows chunk math**: The summary line `"5 items • 1 chunks • Estimated time: ~3s"` exposes implementation details. For most sends (under 10 items), this is noise. Should simplify to just `"5 items"` and only show chunk/time info when there are multiple chunks.

5. **Stale hook name**: `useBatchSendToShopify` is still named after Shopify even though it now does inventory + queue. Minor but misleading for maintenance.

### Proposed Changes

**1. Add large-batch confirmation** — `src/components/CurrentBatchPanel.tsx`
- Before opening `BatchConfigDialog`, if `itemCount > 10`, show `ConfirmActionDialog` requiring typed "CONFIRM". Only proceed to the config dialog after confirmation.

**2. Add confirmation to per-item send button** — `src/components/CurrentBatchPanel.tsx`
- Wrap the inline send button's `onClick` with a simple confirmation (window.confirm or a small dialog) showing the item name.

**3. Simplify toast output** — `src/hooks/useBatchSendToShopify.ts`
- Remove per-chunk success toasts (`toast.success("Chunk X/Y completed...")`).
- Keep only the final summary toast and any error/warning toasts.

**4. Simplify processing summary for small batches** — `src/components/BatchConfigDialog.tsx`
- If `itemCount <= batchSize` (single chunk), show just `"{count} items"` plus vendor.
- Only show chunk count and estimated time when there are multiple chunks.

**5. No hook rename** — cosmetic, low priority, skip for now.

### Files Changed

| File | What |
|------|------|
| `src/components/CurrentBatchPanel.tsx` | Add `ConfirmActionDialog` for batches > 10 items; add confirm for per-item send |
| `src/hooks/useBatchSendToShopify.ts` | Remove per-chunk success toasts, keep final summary only |
| `src/components/BatchConfigDialog.tsx` | Simplify processing summary for single-chunk sends |

