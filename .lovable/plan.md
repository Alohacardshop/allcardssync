

## End-to-End Title & Description Audit

### Current State: 6 Separate Implementations

```text
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│    INTAKE (UI)       │   │      SHOPIFY         │   │       EBAY           │
├──────────────────────┤   ├──────────────────────┤   ├──────────────────────┤
│ generateTitle()      │   │ Graded Card: inline  │   │ buildTitle()         │
│ src/utils/           │   │ Graded Comic:        │   │ ebayTemplateResolver │
│ generateTitle.ts     │   │   buildComicTitle()   │   │                      │
│                      │   │ Raw: inline (v2)     │   │ buildDescription()   │
│ (4 paths: graded/raw │   │                      │   │ ebayTemplateResolver │
│  × card/comic)       │   │                      │   │                      │
└──────────────────────┘   └──────────────────────┘   └──────────────────────┘
```

### Issues Found

#### 1. TITLES — 3 different implementations, inconsistent formats

| Surface | Graded Card | Raw Card | Graded Comic | Raw Comic |
|---------|-------------|----------|--------------|-----------|
| **Intake UI** | `YEAR BRAND SUBJECT #NUM VARIANT COMPANY GRADE` | `YEAR BRAND SUBJECT #NUM CONDITION` | `PUB TITLE #ISSUE MONTH YEAR VARIANT COMPANY GRADE` | `PUB TITLE #ISSUE MONTH YEAR CONDITION` |
| **Shopify Graded** | `year brand subject #num variant category company grade` (inline, includes `category` field — differs from UI) | N/A (different function) | `PUB TITLE #ISSUE MONTH YEAR VARIANT COMPANY GRADE` → `.toUpperCase()` (ALL CAPS — differs from UI) | N/A |
| **Shopify Raw** | N/A | `brand subject cardNumber condition` (**missing year, missing #prefix on cardNumber**) | Not handled (same raw path) | Not handled separately |
| **eBay fallback** | Same as intake | Same as intake | Comic includes `#ISSUE YEAR` but **no month** | Same |

**Key title problems:**
- **Shopify raw title (v2-shopify-send-raw line 150)**: Missing `year`, no `#` prefix on card number, no deduplication, no comic-specific ordering. Just `parts = [brandTitle, subject, cardNumber, condition].filter(Boolean).join(' ')`.
- **Shopify graded comic title (buildComicTitle)**: Forces `.toUpperCase()` — contradicts the "unified title" memory that says uppercase was removed.
- **Shopify graded card title (shopify-sync-core line 435-446)**: Includes a `category` field that no other surface uses (e.g., appends "holo" from category tag).
- **eBay comic fallback**: Missing month from publication date (only has year).

#### 2. DESCRIPTIONS — 4 different implementations

| Surface | Graded Card | Raw Card | Graded Comic |
|---------|-------------|----------|--------------|
| **Shopify Graded** | `title + cert + "Graded brand subject from year, company Grade grade"` (plain text, no HTML) | N/A | Rich HTML with `<strong>` labels for cert, grade, issue, publisher, etc. |
| **Shopify Raw** | N/A | `title + SKU + "Raw brand subject #num - condition Condition" + image disclaimer` (plain text) | Not handled — uses same raw card template |
| **eBay (template)** | Template-driven (good) | Template-driven (good) | Template-driven (good) |
| **eBay (fallback)** | HTML with `<h2>` subject, `<p>` fields for brand/year/card#/variant/grade/cert | Same | Same (no comic-specific fields like publisher, issue) |

**Key description problems:**
- **Shopify raw description**: No HTML formatting, includes SKU in body (should be metadata only), has hardcoded image disclaimer.
- **Shopify graded card description**: Plain text, not HTML. Very sparse compared to comic description.
- **eBay fallback description**: Generic for all types — doesn't distinguish comics from cards. Comics don't get publisher/issue/publication date fields.
- **Shopify raw comic**: No comic-specific description path exists — raw comics get the generic raw card description.

### Plan

#### Step 1: Fix Shopify Raw Title (`v2-shopify-send-raw`)

Replace the inline title builder (line 144-151) with the same 4-path logic from `generateTitle.ts`. Since this is a Deno edge function, we can't import from `src/`, so replicate the logic inline or create a shared Deno-compatible version. The fix:
- Add `year` to the title
- Add `#` prefix to card number
- Use comic ordering for `isComic` items (publisher first, issue number, month/year)
- Add deduplication
- Use raw vs graded variant logic

#### Step 2: Fix Shopify Graded Comic Title — Remove `.toUpperCase()`

In `shopify-sync-core.ts` `buildComicTitle()` (line 193), remove `.toUpperCase()` to match the unified title contract.

#### Step 3: Fix Shopify Graded Card Title — Remove extra `category` field

In `shopify-sync-core.ts` (line 441), the graded card title includes `category` (e.g., "Normal" → lowercased). This field doesn't appear in any other title surface. Remove it.

#### Step 4: Fix Shopify Raw Description

Replace the raw description builder (v2-shopify-send-raw lines 153-165) with proper HTML formatting:
- **Raw Card**: HTML with brand, year, card#, condition
- **Raw Comic**: HTML with publisher, title, issue, publication date, condition
- Remove SKU from description body (it's in metafields)
- Keep image disclaimer

#### Step 5: Fix Shopify Graded Card Description

In `shopify-sync-core.ts` (lines 448-453), upgrade the plain-text graded card description to HTML format matching the comic description style (labeled fields with `<strong>` tags).

#### Step 6: Fix eBay Fallback Description

In `ebayTemplateResolver.ts` `buildDescription()` (lines 379-391), add comic-specific fields when `main_category === 'comics'` (publisher, issue number, publication date).

#### Step 7: Deploy

Redeploy: `v2-shopify-send-raw`, `process-shopify-sync-queue`, `bulk-shopify-sync`

### Files to Change

1. **Edit**: `supabase/functions/v2-shopify-send-raw/index.ts` — title + description rewrite
2. **Edit**: `supabase/functions/_shared/shopify-sync-core.ts` — remove `.toUpperCase()` from comic title, remove `category` from card title, upgrade graded card description to HTML
3. **Edit**: `supabase/functions/_shared/ebayTemplateResolver.ts` — add comic-aware fallback description
4. **Deploy**: 3 edge functions

