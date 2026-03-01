

# PSA Comic Data → eBay Sync Readiness Check

## Current State

The PSA scraper and cache are now correctly persisting all comic fields. The eBay listing pipeline has two paths:

1. **`ebay-create-listing`** (single item) — uses `select('*')` so it gets ALL intake_items columns including `variant`, `main_category`, `cgc_cert`, `psa_snapshot`. This path works.

2. **`ebay-sync-processor`** (queue batch) — only selects 14 specific columns. **Missing**: `variant`, `main_category`, `cgc_cert`, `psa_snapshot`. This means batch-queued comics won't get correct aspects (no Variant Cover, no cert number for CGC, category detection may fail).

## What's Already Working

- `buildComicAspects()` correctly maps Publisher, Issue Number, Variant Cover, Grader, Grade, Certification Number
- `detectCategoryFromBrandDB()` + `buildCategoryAwareAspects()` routes comics to the comic aspect builder
- Comic listing templates exist for PSA/CGC graded comics
- All PSA scraped fields are cached in `psa_certificates`

## Gap: `ebay-sync-processor` Missing Columns

The select query on line 64-81 needs these additional columns:

```
variant,
main_category,
cgc_cert,
psa_snapshot
```

Without these, batch-processed comics will:
- Miss the "Variant Cover" aspect
- Miss CGC certification numbers
- Potentially fail category detection (falls back to brand lookup only)

## Plan

### 1. Update `ebay-sync-processor/index.ts` select query
Add `variant`, `main_category`, `cgc_cert`, and `psa_snapshot` to the intake_items join select (lines 64-81).

### 2. No other changes needed
- `buildComicAspects` already accepts all these fields
- `ebay-create-listing` already uses `select('*')`
- Templates and category resolution are already wired up
- PSA data is persisted correctly after the previous fix

