

## Convert Auto-Decline to Percentage-Based

Currently `auto_decline_price` is stored as a fixed dollar amount. The user wants it to be a percentage of the listing price instead, so the decline threshold scales with each item's price.

### Changes

**1. Database: Rename column for clarity**
- SQL migration: rename `auto_decline_price` to `auto_decline_percent` (numeric, 0-100) on `ebay_listing_templates`
- Update existing data: if any templates have a value, we can null them out or leave as-is (they'll need re-entry as percentages)

**2. `src/components/admin/EbayTemplateManager.tsx`**
- Change the auto-decline input label from "Auto-Decline below ($)" to "Auto-Decline below (% of price)"
- Update placeholder to e.g. "e.g. 80" meaning 80% of listing price
- Update the badge display from `≥$X` to `≥X%`
- Change step to `1`, max to `100`
- Update field references from `auto_decline_price` to `auto_decline_percent`

**3. `supabase/functions/ebay-sync-processor/index.ts` (~lines 601-603, 638-640, 881-883)**
- At each `autoDeclinePrice` usage, compute the dollar value: `finalPrice * (template.auto_decline_percent / 100)`
- Send computed dollar value to eBay API (it still expects a dollar amount)

**4. `src/integrations/supabase/types.ts`**
- Update the type from `auto_decline_price` to `auto_decline_percent`

**5. Redeploy `ebay-sync-processor`**

### Result
Template editor shows "Auto-Decline below 80%" → at sync time, an item priced at $200 would auto-decline offers below $160.

