

## Why SKU 146094215 is stuck at "pending"

**Root Cause**: The item was sent to inventory via `useSendToInventory` hook, which correctly calls the `send_and_queue_inventory` RPC (queuing the item in `shopify_sync_queue`), but **never triggers the `shopify-sync` edge function** to actually process the queue.

The batch send hook (`useBatchSendToShopify`) has this trigger on line 382:
```typescript
await supabase.functions.invoke('shopify-sync', { body: {} })
```

But `useSendToInventory` (line 74-90, `onSuccess`) does not. The item sits in the queue forever unless someone manually triggers the processor or the batch hook happens to run.

**Current state of this item:**
- `shopify_sync_queue` status: `queued` (never picked up)
- `shopify-sync` edge function: **zero recent logs** — never invoked
- Sync mode: `auto` (correctly set)

---

## Fix

**1. Add sync processor trigger to `useSendToInventory.ts`**

In the `onSuccess` callback, after the queue invalidation, invoke the `shopify-sync` edge function — same pattern as `useBatchSendToShopify`:

```typescript
// After invalidating queries in onSuccess:
try {
  await supabase.functions.invoke('shopify-sync', { body: {} });
} catch (e) {
  console.warn('Failed to trigger sync processor', e);
}
```

This ensures every path that queues items (single send, bulk send, batch send) also kicks off the processor.

**2. Immediately process the stuck item**

Manually trigger the sync processor for the currently stuck queue item so SKU 146094215 gets synced without waiting for another batch operation.

---

### Technical details

| Component | Issue |
|-----------|-------|
| `src/hooks/useSendToInventory.ts` | Missing `supabase.functions.invoke('shopify-sync')` in `onSuccess` |
| `shopify_sync_queue` | 1 item stuck at `queued` status (queue_position 2328) |
| `shopify-sync` edge function | Never invoked — no logs at all recently |

