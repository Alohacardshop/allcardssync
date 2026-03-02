

## Add Location Management UI to the eBay Settings Tab

The `ebay-manage-location` edge function is deployed but has no frontend. We'll add a "Merchant Location" card to the Settings tab on `/ebay` that lets you verify and register your eBay location.

### What it does

- **Verify button**: Calls `GET ebay-manage-location` to check if the configured `location_key` exists on eBay. Shows the result (found with details, or "not registered").
- **Register form**: If not found, shows address fields (`addressLine1`, `city`, `stateOrProvince`, `postalCode`, `country`) and a Register button that calls `POST ebay-manage-location`.
- Displays the current `location_key` from config so you know what key is being checked.

### Files to change

1. **`src/pages/EbayApp.tsx`** — Add a "Merchant Location" card inside the Settings tab (after the connection card, around line 1019). It will:
   - Show the current `location_key` from `selectedConfig`
   - Have a "Verify Location" button that invokes `ebay-manage-location` via GET
   - Show verification result (success with location details, or error)
   - On failure, expand an address form to register the location via POST
   - Show success/error toast on registration

No new files needed — just UI wiring to the existing edge function.

