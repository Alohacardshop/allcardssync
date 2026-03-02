

## Fix: Template Placeholder Mismatch (Double vs Single Curly Braces)

### Problem
Comic templates use `{{placeholder}}` (double curly braces) but `buildTitle()` and `buildDescription()` only replace `{placeholder}` (single curly braces). Result: `{Amazing Spider-Man}` instead of `Amazing Spider-Man`.

### Solution
Update `buildTitle()` and `buildDescription()` in `supabase/functions/_shared/ebayTemplateResolver.ts` to handle **both** `{{placeholder}}` and `{placeholder}` formats.

### Changes

**File: `supabase/functions/_shared/ebayTemplateResolver.ts`**

In both `buildTitle()` (~line 265) and `buildDescription()` (~line 295), add double-brace replacements **before** the existing single-brace ones:

```typescript
// Add these BEFORE existing single-brace replacements:
.replace(/{{subject}}/g, item.subject || '')
.replace(/{{brand_title}}/g, item.brand_title || '')
.replace(/{{brand}}/g, item.brand_title || '')
.replace(/{{year}}/g, item.year || '')
.replace(/{{grade}}/g, item.grade || '')
.replace(/{{grading_company}}/g, item.grading_company || '')
.replace(/{{card_number}}/g, item.card_number || '')
.replace(/{{variant}}/g, item.variant || '')
.replace(/{{psa_cert}}/g, item.psa_cert || '')
.replace(/{{sku}}/g, item.sku || '')
.replace(/{{cgc_cert}}/g, item.cgc_cert || '')
// Then existing single-brace replacements follow...
```

Double-brace patterns must be matched first so they don't get partially consumed by single-brace patterns.

**No other files affected.** After deploying, re-sync the item to get corrected title and description on eBay.

