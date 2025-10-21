# Batch Upload & Barcode Resync Fixes

## Issues Fixed

### 1. ✅ Barcode Not Added When Resyncing
**Problem**: Individual item resync wasn't including barcode data when updating Shopify.

**Solution**: Updated `handleResync` function in `src/pages/Inventory.tsx` to:
- Generate barcodes for **raw cards** from TCGPlayer ID + condition (e.g., `2895134-NM`)
- Use **SKU as barcode** for graded cards
- Match the same logic used in bulk resync

**Barcode Format**:
- **Raw Cards**: `{tcgplayer_id}-{condition}` (e.g., `2895134-NM`, `4688393-LP`)
- **Graded Cards**: Uses SKU directly as barcode

---

### 2. ✅ Better Error Logging for Batch Import Failures
**Problem**: When batch imports failed (e.g., "0 successful, 6 failed"), there was no way to diagnose why.

**Solution**: Enhanced error logging in `src/components/TCGPlayerBulkImport.tsx`:
- Detailed console logging showing item name, store, location, and sub-category
- **First failure** now shows a detailed toast with:
  - Error message
  - Item name
  - Store key
  - Location GID
- Helps quickly identify missing data or configuration issues

**Common Failure Causes**:
1. **Missing store or location** - User must select store/location before import
2. **Missing sub-category** - TCG items require sub-category selection
3. **RLS policy issues** - User may not have access to selected store/location
4. **Invalid data** - Check item has required fields (name, set, condition, price)

---

## How to Test

### Test Barcode on Resync:
1. Go to Inventory page
2. Find an existing item (Raw or Graded)
3. Click "Resync" button on the item
4. Check Shopify product - barcode field should now be populated
   - Raw: `{tcgplayer_id}-{condition}`
   - Graded: SKU value

### Diagnose Batch Import Failures:
1. Go to Bulk Import page
2. Upload a TCGPlayer CSV
3. If items fail, check:
   - Browser console for detailed error logs
   - Toast message for first failure details
   - Verify store/location/sub-category are selected

---

## Code Changes

### File: `src/pages/Inventory.tsx`
**Function**: `handleResync` (lines 528-618)
- Added barcode generation logic matching bulk resync
- Raw cards: Generate from TCGPlayer ID + condition
- Graded cards: Use SKU as barcode
- Calls `sendRawToShopify` or `sendGradedToShopify` directly with barcode

### File: `src/components/TCGPlayerBulkImport.tsx`  
**Function**: Error handling in `handleAddToBatch` (lines 521-540)
- Enhanced error logging with item details
- First failure shows detailed toast for quick diagnosis
- Includes store, location, sub-category in logs

---

## Expected Behavior

**Before**:
- ❌ Resync didn't add barcodes to Shopify products
- ❌ Batch failures showed "0 successful, 6 failed" with no details

**After**:
- ✅ Resync adds proper barcodes (TCGPlayer ID format for raw, SKU for graded)
- ✅ First batch failure shows detailed error with item/store/location info
- ✅ Console logs show full context for all failures

---

## Notes

- Barcode format matches the SKU generation logic using TCGPlayer product ID
- Both individual and bulk resync now use identical barcode logic
- Error logging helps identify configuration issues quickly
- Users should check browser console if batch imports fail
