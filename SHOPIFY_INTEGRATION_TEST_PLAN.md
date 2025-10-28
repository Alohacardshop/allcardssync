# Shopify Integration Test Plan

## Overview
Comprehensive testing plan for Shopify webhooks, metadata sync, and bidirectional inventory management.

## Prerequisites
- Shopify store credentials configured in `system_settings`
- Metafield definitions created in Shopify
- Webhook subscriptions registered in Shopify admin

## Test Categories

### 1. Configuration Verification

#### Test 1.1: Config Check
**Edge Function**: `shopify-config-check`
**Purpose**: Verify store credentials and connection

```bash
# Expected Response
{
  "storeDomain": "your-store.myshopify.com",
  "hasAdminToken": true,
  "hasWebhookSecret": true,
  "shop": { ... shop details ... },
  "locations": [ ... list of locations ... ]
}
```

**Pass Criteria**:
- ✅ Returns valid shop data
- ✅ Shows configured locations
- ✅ Confirms all credentials present

#### Test 1.2: Locations Fetch
**Edge Function**: `shopify-locations`
**Purpose**: Verify location access for multi-location inventory

```bash
# Expected Response
{
  "storeKey": "hawaii",
  "locationCount": 5,
  "locations": [...]
}
```

**Pass Criteria**:
- ✅ Returns all store locations
- ✅ Includes location IDs and names
- ✅ Shows which locations are active

---

### 2. Metafield Definitions

#### Test 2.1: Create Metafield Definitions
**Edge Function**: `shopify-create-metafield-definitions`
**Purpose**: Register custom metafields for product sync

**Metafields to Create**:
```
acs.sync.external_id
acs.sync.intake_id
acs.sync.main_category
acs.sync.sub_category
acs.sync.item_type
acs.sync.grading_company
acs.sync.grade
acs.sync.cert_number
acs.sync.cert_url (PUBLIC_READ)
acs.sync.brand_title
acs.sync.card_number
acs.sync.year
acs.sync.variant
acs.sync.subject
acs.sync.rarity
acs.sync.catalog_snapshot (JSON)
acs.sync.psa_snapshot (JSON)
acs.sync.grading_data (JSON)
```

**Pass Criteria**:
- ✅ All 18 definitions created successfully
- ✅ cert_url is PUBLIC_READ for storefront
- ✅ JSON fields properly configured
- ✅ No duplicate definition errors

**Manual Verification**:
1. Go to Shopify Admin → Settings → Custom data → Products
2. Verify all `acs.sync.*` metafields exist
3. Check cert_url has "Storefront access" enabled

---

### 3. Webhook Reception & HMAC Validation

#### Test 3.1: HMAC Security Verification
**Webhook**: Any webhook from Shopify
**Purpose**: Ensure webhook signatures are validated

**Test Cases**:
1. **Valid HMAC**: Should process webhook
2. **Invalid HMAC**: Should return 401 Unauthorized
3. **Missing HMAC with secret configured**: Should return 401
4. **No HMAC and no secret**: Should log warning but process

**Pass Criteria**:
- ✅ Valid signatures accepted
- ✅ Invalid signatures rejected with 401
- ✅ Security events logged to `system_logs`
- ✅ Webhook deduplication working (same webhook_id rejected)

#### Test 3.2: Webhook Idempotency
**Purpose**: Prevent duplicate processing

**Test**:
- Send same webhook twice with identical `x-shopify-webhook-id`
- Second request should return: `{"message": "Webhook already processed"}`

**Pass Criteria**:
- ✅ Duplicate webhook IDs rejected
- ✅ 200 status returned (not error)
- ✅ No database updates on duplicate

---

### 4. Product Webhook Handlers

#### Test 4.1: Product Delete Webhook
**Topic**: `products/delete`
**Payload**:
```json
{
  "id": "123456789"
}
```

**Expected Behavior**:
1. Find all `intake_items` with matching `shopify_product_id`
2. Update items:
   - Set `shopify_removed_at` to current timestamp
   - Set `shopify_removal_mode` to `'webhook_product_delete'`
   - Clear `shopify_product_id`
   - Set `shopify_sync_status` to `'synced'`

**Pass Criteria**:
- ✅ All matching items updated
- ✅ Items marked as removed but preserved in database
- ✅ Store key validation working

#### Test 4.2: Product Listing Remove
**Topic**: `product_listings/remove`
**Payload**:
```json
{
  "product_id": "123456789"
}
```

**Expected Behavior**:
1. Mark items as unpublished (not deleted)
2. Update `shopify_removal_mode` to `'webhook_unpublished'`

**Pass Criteria**:
- ✅ Items marked as unpublished
- ✅ `shopify_product_id` retained
- ✅ Items NOT deleted from database

#### Test 4.3: Product Update
**Topic**: `products/update`
**Payload**:
```json
{
  "id": "123456789",
  "title": "Updated Title",
  "vendor": "New Vendor",
  "product_type": "Updated Type"
}
```

**Expected Behavior**:
- Webhook received and logged
- Can be used for future sync validation

**Pass Criteria**:
- ✅ Webhook processed without error
- ✅ Event stored in `webhook_events`

---

### 5. Order Webhooks & Inventory Sync

#### Test 5.1: Order Created (Graded Item)
**Topic**: `orders/create`
**Payload**:
```json
{
  "id": "5555555",
  "financial_status": "paid",
  "currency": "USD",
  "line_items": [
    {
      "sku": "PSA-10-CHARIZARD-001",
      "variant_id": "44444444",
      "quantity": 1,
      "price": "500.00",
      "location_id": "66666666"
    }
  ]
}
```

**Expected Behavior** (Graded Item):
1. Find item by SKU and location
2. Set `quantity = 0`
3. Record sale:
   - `sold_at` = now
   - `sold_price` = "500.00"
   - `sold_order_id` = "5555555"
   - `sold_channel` = "shopify"
   - `sold_currency` = "USD"

**Pass Criteria**:
- ✅ Only paid/partially_paid orders processed
- ✅ Quantity set to 0
- ✅ Sale metadata recorded
- ✅ Location validation enforced

#### Test 5.2: Order Created (Raw Item)
**Same webhook but for raw item**

**Expected Behavior** (Raw Item):
1. Find item by SKU and location
2. Decrement quantity by order quantity
3. If quantity reaches 0, record sale metadata
4. **Bidirectional Sync**: Update Shopify inventory back

**Pass Criteria**:
- ✅ Quantity decremented correctly
- ✅ Sale recorded when quantity = 0
- ✅ Inventory synced back to Shopify
- ✅ Logs show: `✓ Synced inventory back to Shopify: SKU → new_quantity`

#### Test 5.3: Unpaid Order (Should be Ignored)
**Same payload but `financial_status: "pending"`**

**Expected Behavior**:
- Webhook logs: `Skipping order 5555555 - not paid yet (status: pending)`
- NO inventory changes

**Pass Criteria**:
- ✅ Order ignored until paid
- ✅ No inventory deduction

#### Test 5.4: Order Cancellation
**Topic**: `orders/cancelled`
**Payload**:
```json
{
  "id": "5555555",
  "line_items": [
    {
      "sku": "PSA-10-CHARIZARD-001",
      "quantity": 1
    }
  ]
}
```

**Expected Behavior**:
- **Graded**: Restore `quantity = 1`, clear sale fields
- **Raw**: Restore previous quantity, clear sale if quantity was 0

**Pass Criteria**:
- ✅ Inventory restored
- ✅ Sale metadata cleared
- ✅ Items available for resale

#### Test 5.5: Refund Created
**Topic**: `refunds/create`
**Payload**: Similar to cancellation

**Expected Behavior**:
- Process refund and restore inventory if applicable

---

### 6. Inventory Level Webhooks

#### Test 6.1: Inventory Level Update
**Topic**: `inventory_levels/update`
**Payload**:
```json
{
  "inventory_item_id": "77777777",
  "location_id": "66666666",
  "available": 5
}
```

**Expected Behavior**:
1. Find items by `shopify_inventory_item_id` AND `shopify_location_gid`
2. Update `quantity` to match Shopify
3. Log: `Updated quantity for item {id} from X to 5`

**Pass Criteria**:
- ✅ Location-specific sync (doesn't affect other locations)
- ✅ Only raw items updated (graded items maintain quantity=1 or 0)
- ✅ Fallback matching works if direct match fails

#### Test 6.2: Inventory Items Update
**Topic**: `inventory_items/update`
**Purpose**: Handle alternative inventory webhook topic

**Pass Criteria**:
- ✅ Same behavior as `inventory_levels/update`
- ✅ Both webhook topics supported

---

### 7. Multi-Store & Multi-Location Testing

#### Test 7.1: Multiple Stores
**Purpose**: Verify store isolation

**Test**:
1. Configure two stores (e.g., `hawaii` and `ward`)
2. Send webhooks from each store
3. Verify items only updated for correct `store_key`

**Pass Criteria**:
- ✅ Store key correctly identified from domain
- ✅ No cross-store updates
- ✅ Each store's credentials used appropriately

#### Test 7.2: Multiple Locations per Store
**Purpose**: Verify location-specific inventory

**Test**:
1. Create items at different locations
2. Send inventory webhooks for specific locations
3. Verify only matching location updated

**Pass Criteria**:
- ✅ Location GID validation enforced
- ✅ Items at other locations unchanged
- ✅ Fallback matching only with location context

---

## Test Execution Checklist

### Phase 1: Setup Verification
- [ ] Run `shopify-config-check` for each store
- [ ] Verify all locations returned
- [ ] Run `shopify-create-metafield-definitions`
- [ ] Manually verify metafields in Shopify admin

### Phase 2: Security Testing
- [ ] Send test webhook with valid HMAC → should process
- [ ] Send test webhook with invalid HMAC → should reject (401)
- [ ] Send duplicate webhook → should ignore (200)
- [ ] Check `system_logs` for security events

### Phase 3: Product Webhooks
- [ ] Test `products/delete` webhook
- [ ] Test `product_listings/remove` webhook
- [ ] Verify items marked correctly in database

### Phase 4: Order Flow
- [ ] Test order with graded item (paid) → quantity to 0
- [ ] Test order with raw item (paid) → decrement + sync back
- [ ] Test unpaid order → should skip
- [ ] Test order cancellation → restore inventory
- [ ] Test refund → restore if needed

### Phase 5: Inventory Sync
- [ ] Test `inventory_levels/update` → should update local quantity
- [ ] Test `inventory_items/update` → should work same as above
- [ ] Verify bidirectional sync (Shopify ← ACS ← Shopify)

### Phase 6: Multi-Store/Location
- [ ] Test webhooks from Store A don't affect Store B
- [ ] Test location-specific inventory updates
- [ ] Verify `shopify_location_gid` filtering

---

## Monitoring & Debugging

### Edge Function Logs
Check logs for each function:
- `shopify-webhook`: All webhook processing
- `shopify-config-check`: Connection verification
- `shopify-locations`: Location fetching
- `shopify-create-metafield-definitions`: Metafield setup

### Database Tables to Monitor
1. **webhook_events**: All received webhooks
2. **intake_items**: Inventory changes
3. **system_logs**: Security and error events
4. **shopify_sync_queue**: Pending sync operations (if used)

### Key Log Messages to Look For
```
✅ Good:
- "HMAC signature verified successfully"
- "✓ Synced inventory back to Shopify"
- "Webhook already processed" (idempotency working)

⚠️ Warnings:
- "Skipping order X - not paid yet"
- "Could not determine store key from domain"

❌ Errors:
- "Invalid HMAC signature detected"
- "Failed to update items"
- "Missing required webhook headers"
```

---

## Success Criteria

### Critical (Must Pass)
- ✅ HMAC validation working (security)
- ✅ Webhook idempotency (no duplicates)
- ✅ Order webhooks update inventory correctly
- ✅ Bidirectional sync: Shopify ↔ ACS
- ✅ Store/location isolation

### Important (Should Pass)
- ✅ All metafields created
- ✅ Product delete/unpublish handled
- ✅ Order cancellation restores inventory
- ✅ Location-specific inventory updates

### Nice to Have
- ✅ Fallback matching for inventory items
- ✅ Comprehensive logging
- ✅ Product update webhook received

---

## Troubleshooting Guide

### Issue: Webhooks not received
- Check webhook subscriptions in Shopify admin
- Verify webhook URL points to edge function
- Check CORS headers

### Issue: HMAC validation fails
- Verify webhook secret matches in both systems
- Check HMAC calculation using raw body
- Ensure no body modifications before verification

### Issue: Inventory not syncing
- Check `shopify_inventory_item_id` populated
- Verify `shopify_location_gid` matches
- Check Shopify API credentials valid
- Review edge function logs for sync errors

### Issue: Wrong store items updated
- Verify store key detection from domain
- Check `x-shopify-shop-domain` header
- Ensure `store_key` column properly set

---

## Next Steps After Testing

1. **Production Webhook Registration**
   - Register all webhook topics in Shopify
   - Configure webhook secrets
   - Test with real orders (in test mode first)

2. **Monitoring Setup**
   - Set up alerts for failed webhooks
   - Monitor `webhook_events` for processing delays
   - Track `system_logs` for security events

3. **Documentation**
   - Document any edge cases found
   - Create runbook for common issues
   - Train team on webhook monitoring
