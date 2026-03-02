

## Fix: Update Comic Templates to Use Leaf Category IDs

### The Problem
The 4 comic templates all use `category_id: 63` ("Comic Books"), which is a **parent category** on eBay, not a leaf. eBay error 25005 rejects any listing that doesn't use a leaf category. The system is correctly pulling the category from the template — the template just has the wrong ID.

### The Fix
Update the `category_id` on the graded comic templates from `63` → `259061` ("Graded Comic Books"), which is the correct leaf category already in your `ebay_categories` registry.

**Database update (SQL migration):**
```sql
UPDATE ebay_listing_templates
SET category_id = '259061', category_name = 'Graded Comic Books'
WHERE category_id = '63' AND is_graded = true;
```

This targets all 4 graded comic templates (CGC × 2 stores, PSA × 2 stores). No code changes needed — the listing processor already reads `template.category_id` correctly.

### Optional: Verify 183454 (TCG)
Category `183454` ("CCG Individual Cards") should also be verified as a leaf. If it's also a parent, the same fix applies for TCG templates. We can use the Schema Inspector tab you already have to check this.

