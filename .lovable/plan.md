
## Implementation Roadmap: eBay & Shopify Multi-Channel Sync

Based on my audit, here's the recommended step-by-step approach to get your eBay integration fully operational alongside your existing Shopify workflow.

---

### Current State Summary

| Component | Hawaii Store | Las Vegas Store |
|-----------|-------------|-----------------|
| **Shopify Listed** | 71 items | 1,737 items |
| **eBay Flagged** | 0 items | 2 items |
| **eBay Listed** | 0 items | 0 items |
| **Default Policies Set** | No (all NULL) | N/A |
| **Policies Synced** | 24 policies available | N/A |

---

### Phase 1: Fix Settings Persistence (Immediate)

**Problem**: The auto-save I just implemented needs to be tested. Your policy selections aren't persisting.

**Actions**:
1. Navigate to the eBay Settings tab
2. Select your default policies from the dropdowns:
   - **Fulfillment**: "Graded Card" (policy_id: 291793805021)
   - **Payment**: "Instant Payment" (policy_id: 291793771021)  
   - **Return**: "No returns all sales final" (policy_id: 289553376021)
3. Watch for "Saving..." → "All changes saved" indicator
4. Verify the database update occurred

---

### Phase 2: Flag Items for eBay Listing

**Option A - Bulk Listing UI** (Recommended for initial testing)
- Go to eBay App → "Bulk Listing" tab
- Filter by category (e.g., "Pokemon", "Sports")
- Select items and click "Mark for eBay"
- Then click "Queue for Sync" to add them to the processing queue

**Option B - Sync Rules** (Recommended for automation)
- Go to eBay App → "Sync Rules" tab
- Create rules like:
  - Include all graded cards with price > $50
  - Include all Pokemon items
  - Exclude items without images
- Run "Apply Rules" to automatically flag matching items

**Option C - Individual Toggle**
- On each inventory card, click the eBay icon to toggle `list_on_ebay`

---

### Phase 3: Process the eBay Sync Queue

Once items are queued, the `ebay-sync-processor` edge function handles:
1. Creating eBay inventory items
2. Creating offers with your default policies
3. Publishing listings
4. Updating `intake_items` with eBay listing IDs

**Trigger options**:
- **Manual**: Click "Process Queue" in the Sync Queue Monitor
- **Scheduled**: Set up a cron job to call the processor periodically
- **Automatic**: Invoke processor after bulk queue operations

---

### Phase 4: Shopify Import (Pulling Existing Listings)

For importing your Shopify products to cross-list on eBay:

1. **Existing Edge Function**: `shopify-import-inventory`
   - Pulls products from Shopify into `intake_items`
   - Sets `list_on_shopify = true`
   - Preserves Shopify product IDs for sync

2. **After Import**:
   - Flag desired items for eBay using Phase 2 methods
   - Queue for eBay sync

---

### Technical Implementation Needed

| Task | Priority | Effort |
|------|----------|--------|
| Test auto-save and set default policies | Critical | 5 min |
| Add "Process Queue" button to trigger sync-processor | High | 30 min |
| Add progress indicator during bulk operations | Medium | 1 hr |
| Create scheduled job for automatic queue processing | Medium | 1 hr |
| Add "Import from Shopify" button to eBay Bulk Listing | Low | 2 hr |

---

### Recommended Immediate Steps

1. **Test the auto-save**: Select policies in the eBay Settings tab and verify they persist
2. **Start small**: Flag 5-10 test items for eBay via the Bulk Listing UI
3. **Queue and process**: Use the Sync Queue Monitor to process test items
4. **Verify on eBay**: Check that listings appear in your eBay seller account
5. **Scale up**: Once validated, use Sync Rules to flag larger batches

---

### Files Involved

| File | Purpose |
|------|---------|
| `src/pages/EbayApp.tsx` | Main settings + auto-save (just updated) |
| `src/components/admin/EbayBulkListing.tsx` | Bulk select and queue items |
| `src/components/admin/EbaySyncQueueMonitor.tsx` | View and manage queue |
| `src/components/admin/EbaySyncRulesEditor.tsx` | Create automation rules |
| `supabase/functions/ebay-sync-processor/index.ts` | Process queue entries |
| `supabase/functions/ebay-create-listing/index.ts` | Create individual listings |
| `supabase/functions/ebay-apply-sync-rules/index.ts` | Apply automation rules |
