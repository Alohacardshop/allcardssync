
# Inventory Management Efficiency Overhaul

## Executive Summary
This plan transforms the inventory system to use **Shopify tags as the primary categorization system** while making **this program the source of truth** that syncs TO Shopify. The current system has scattered data, inefficient auto-refresh, and underutilized Shopify metadata.

## Current State Analysis

### Data Distribution
| Source | Count | Notes |
|--------|-------|-------|
| shopify-pull (Las Vegas) | 1,297 | Imported from Shopify |
| shopify-pull (Hawaii) | 813 | Imported from Shopify |
| tcgplayer (Las Vegas) | 278 | Manual intake |
| manual | 227 | Direct entry |

### Tag Usage (Top Tags)
- `sportscards` / `sports` (772 items) - **Primary category**
- `graded` (653 items) - **Item type**
- `pokemon` (399 items) - **Primary category**
- `PSA` (440 items) - **Grading company**
- `baseball/basketball/football` (369 total) - **Sport type**
- Vendor tags: `Joe`, `Neal Rabinowitz`, `Adam` - **Source tracking**

### Current Problems

1. **Type/Category Mismatch**: 1,939 Shopify-pulled items have `type: 'Raw'` and `main_category: null` - they're not properly categorized
2. **Redundant Filters**: Multiple overlapping filter systems (Type, Category, Tags)
3. **Inefficient Auto-Refresh**: 2-minute interval regardless of user activity
4. **Data Flow Confusion**: Unclear if program or Shopify is source of truth
5. **Tag Normalization Issues**: Same data in different formats (`PSA`, `psa-10`, `grade10`)

## Solution Architecture

### Core Principle: This Program as Source of Truth

```text
┌─────────────────────────────────────────────────────────────────┐
│                    INTAKE SYSTEM (Source of Truth)              │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ TCGPlayer    │  │ PSA Lookup   │  │ Manual Entry │          │
│  │ Import       │  │ Import       │  │              │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └─────────────────┴─────────────────┘                   │
│                           │                                     │
│                           ▼                                     │
│              ┌────────────────────────┐                         │
│              │     intake_items       │                         │
│              │  (normalized tags)     │                         │
│              │  (unified categories)  │                         │
│              └────────────┬───────────┘                         │
│                           │                                     │
│         ┌─────────────────┴─────────────────┐                   │
│         ▼                                   ▼                   │
│  ┌──────────────┐                   ┌──────────────┐           │
│  │   Shopify    │                   │    eBay      │           │
│  │  (sync TO)   │                   │  (sync TO)   │           │
│  └──────────────┘                   └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 1: Tag Normalization & Hierarchy

**Create a unified tag taxonomy derived from Shopify but normalized:**

```text
Category (Primary)
├── pokemon
├── sports
│   ├── baseball
│   ├── basketball
│   └── football
├── tcg (other card games)
└── comics

Condition/Type
├── graded
│   ├── psa (PSA graded)
│   ├── cgc (CGC graded)
│   └── bgs (BGS graded)
└── raw

Grade Level (for graded items)
├── gem-mint (10)
├── mint (9)
├── near-mint (8)
└── excellent (7 and below)
```

**Database Changes:**
- Add `normalized_tags TEXT[]` column for cleaned/standardized tags
- Add `primary_category TEXT` derived from tags (pokemon, sports, tcg, comics)
- Add `condition_type TEXT` (graded, raw, sealed)
- Create tag normalization function that runs on insert/update

**Tag Normalization Rules:**
```sql
-- Example normalization rules
'graded', 'PSA', 'psa-10', 'grade10' → ['graded', 'psa', 'grade-10']
'pokemon', 'Pokemon', 'POKEMON' → ['pokemon']
'sports', 'sportscards', 'Sports Cards' → ['sports']
'baseball', 'Baseball Cards' → ['sports', 'baseball']
```

### Phase 2: Smart Auto-Refresh

**Current**: Fixed 2-minute polling regardless of activity
**Proposed**: Adaptive refresh based on context

```typescript
// New smart refresh logic
const getRefreshInterval = () => {
  // No refresh if user is actively editing/selecting
  if (selectedItems.size > 0) return false;
  
  // Fast refresh when syncing
  if (hasPendingSyncs) return 15000; // 15 seconds
  
  // Normal refresh when browsing
  if (document.hasFocus()) return 60000; // 1 minute
  
  // Slow refresh when tab is hidden
  return 300000; // 5 minutes
};
```

**Implementation:**
- Replace fixed `refetchInterval: 120000` with dynamic function
- Use `visibilitychange` event to pause/resume
- Add "changes pending" indicator instead of constant polling

### Phase 3: Unified Filter System

**Current State**: Multiple overlapping filters
- Type filter (Raw/Graded)
- Category filter (TCG/Comics/Sealed)
- Tag filter (Shopify tags)
- Status filters

**Proposed State**: Single unified tag-based filter

```text
┌─────────────────────────────────────────────────────────────────┐
│ Quick Filters: [Pokemon] [Sports] [Graded] [Ready to Sync]...  │
├─────────────────────────────────────────────────────────────────┤
│ [Search...        ] [Status ▼] [Location ▼] [More Filters ▼]   │
├─────────────────────────────────────────────────────────────────┤
│ Active Tags: [pokemon ×] [graded ×]              [Clear All]   │
└─────────────────────────────────────────────────────────────────┘
```

**Changes:**
- Remove separate Type/Category dropdowns
- Enhance Tag filter to be the primary filter mechanism
- Quick Filters become tag presets (e.g., "Pokemon" = `tagFilter: ['pokemon']`)
- Consolidate into fewer, more meaningful filter options

### Phase 4: Sync TO Shopify (Source of Truth)

**Current Flow (confusing):**
```text
Shopify → Pull Products → intake_items ← Manual Entry
                              ↓
                          Sync back? 🤔
```

**Proposed Flow (clear):**
```text
┌─────────────────────────────────────────────────────────────────┐
│                       INTAKE (Source of Truth)                  │
│ - All items created/edited here                                 │
│ - Tags managed here                                             │
│ - Prices set here                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                        [Sync TO Shopify]
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                          SHOPIFY                                │
│ - Receives product data FROM intake                            │
│ - Tags/metafields populated FROM intake                        │
│ - Inventory levels controlled BY intake                        │
└─────────────────────────────────────────────────────────────────┘
```

**Key Changes:**
1. Tags edited in intake are pushed TO Shopify (not pulled FROM)
2. Add "Edit Tags" button to InventoryItemCard
3. When tags change locally, queue item for Shopify resync
4. Remove dependency on shopify_snapshot for categorization

### Phase 5: Layout Efficiency

**Current Layout Issues:**
- RefreshControls takes significant space
- Quick Filters and regular filters are separate cards
- Too many rows of filter dropdowns

**Proposed Compact Layout:**
```text
┌─────────────────────────────────────────────────────────────────┐
│ Inventory Management                    [↻ Auto] [🔄 Refresh]  │
├─────────────────────────────────────────────────────────────────┤
│ [Pokemon][Sports][Graded][Ready to Sync][Errors][+] [Clear All]│
├─────────────────────────────────────────────────────────────────┤
│ [🔍 Search items...     ][Status▼][Location▼][⚙️ More Filters]│
├─────────────────────────────────────────────────────────────────┤
│ Active: [pokemon ×] [graded ×]  │  Showing 847 items          │
└─────────────────────────────────────────────────────────────────┘
```

**Changes:**
- Move refresh controls to header row (compact toggle + button)
- Combine Quick Filters into single scrollable row
- Collapse secondary filters into "More Filters" popover
- Show active filter chips with remove buttons

## Implementation Order

| Step | Task | Impact | Effort |
|------|------|--------|--------|
| 1 | Add `normalized_tags` column + migration | Foundation | Medium |
| 2 | Create tag normalization function | Data quality | Medium |
| 3 | Backfill normalized tags from existing data | Data | Small |
| 4 | Update Quick Filters to use normalized tags | UX | Small |
| 5 | Implement smart auto-refresh | Performance | Medium |
| 6 | Consolidate filter UI (remove redundant dropdowns) | UX | Medium |
| 7 | Add tag editing to InventoryItemCard | Feature | Medium |
| 8 | Update sync functions to push tags TO Shopify | Core feature | Large |
| 9 | Compact layout redesign | UX | Medium |

## Technical Details

### Database Migration

```sql
-- Add normalized tag columns
ALTER TABLE intake_items 
ADD COLUMN IF NOT EXISTS normalized_tags TEXT[],
ADD COLUMN IF NOT EXISTS primary_category TEXT,
ADD COLUMN IF NOT EXISTS condition_type TEXT;

-- Create normalization function
CREATE OR REPLACE FUNCTION normalize_shopify_tags(raw_tags TEXT[])
RETURNS TEXT[] AS $$
DECLARE
  normalized TEXT[] := '{}';
  tag TEXT;
BEGIN
  FOREACH tag IN ARRAY raw_tags LOOP
    -- Lowercase and trim
    tag := lower(trim(tag));
    
    -- Category normalization
    IF tag IN ('pokemon', 'pokémon') THEN
      normalized := array_append(normalized, 'pokemon');
    ELSIF tag IN ('sports', 'sportscards', 'sports cards') THEN
      normalized := array_append(normalized, 'sports');
    ELSIF tag IN ('graded', 'psa', 'cgc', 'bgs') THEN
      normalized := array_append(normalized, 'graded');
      IF tag != 'graded' THEN
        normalized := array_append(normalized, tag);
      END IF;
    ELSIF tag ~ '^grade-?\d+$' OR tag ~ '^psa-?\d+$' THEN
      -- Normalize grade tags: grade10, psa-10, grade-10 → grade-10
      normalized := array_append(normalized, 'grade-' || regexp_replace(tag, '\D', '', 'g'));
    ELSE
      normalized := array_append(normalized, tag);
    END IF;
  END LOOP;
  
  RETURN array(SELECT DISTINCT unnest(normalized));
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-normalize on insert/update
CREATE OR REPLACE FUNCTION trigger_normalize_tags()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.shopify_tags IS NOT NULL THEN
    NEW.normalized_tags := normalize_shopify_tags(NEW.shopify_tags);
    
    -- Derive primary category
    IF 'pokemon' = ANY(NEW.normalized_tags) THEN
      NEW.primary_category := 'pokemon';
    ELSIF 'sports' = ANY(NEW.normalized_tags) THEN
      NEW.primary_category := 'sports';
    ELSIF 'comics' = ANY(NEW.normalized_tags) THEN
      NEW.primary_category := 'comics';
    ELSE
      NEW.primary_category := 'tcg';
    END IF;
    
    -- Derive condition type
    IF 'graded' = ANY(NEW.normalized_tags) THEN
      NEW.condition_type := 'graded';
    ELSIF 'sealed' = ANY(NEW.normalized_tags) THEN
      NEW.condition_type := 'sealed';
    ELSE
      NEW.condition_type := 'raw';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER intake_items_normalize_tags
BEFORE INSERT OR UPDATE ON intake_items
FOR EACH ROW EXECUTE FUNCTION trigger_normalize_tags();
```

### Smart Refresh Hook Update

```typescript
// In useInventoryListQuery.ts
refetchInterval: (query) => {
  // No auto-refresh if user has selected items
  if (filters.hasActiveSelection) return false;
  
  // Check for pending syncs
  const data = query.state.data;
  const hasPending = data?.pages?.some(p => 
    p.items?.some(i => 
      i.shopify_sync_status === 'queued' || 
      i.shopify_sync_status === 'processing'
    )
  );
  
  // Fast refresh when syncs pending
  if (hasPending) return 15000;
  
  // Normal refresh if auto-enabled and tab visible
  if (filters.autoRefreshEnabled && document.hasFocus()) {
    return 60000;
  }
  
  // Slow background refresh
  return 300000;
},
```

### Files to Modify

1. **`src/pages/Inventory.tsx`**
   - Consolidate filter UI
   - Remove redundant dropdowns
   - Move refresh controls to header
   - Add active filter chips display

2. **`src/hooks/useInventoryListQuery.ts`**
   - Implement smart refresh logic
   - Switch to `normalized_tags` for filtering
   - Add `primary_category` filter option

3. **`src/components/InventoryItemCard.tsx`**
   - Add tag editing capability
   - Show normalized tags instead of raw
   - Add "Edit Tags" button

4. **`src/components/inventory/QuickFilterPresets.tsx`**
   - Update presets to use normalized tags
   - Add more category-based presets

5. **`supabase/functions/v2-shopify-send-*`**
   - Push `normalized_tags` to Shopify product tags
   - Update metafields with category/condition info

6. **New: `src/components/inventory/TagEditor.tsx`**
   - Inline tag editing component
   - Autocomplete from existing tags
   - Validation against taxonomy

## Benefits

1. **Consistent Categorization**: All items properly categorized by normalized tags
2. **Reduced Confusion**: One source of truth (this program)
3. **Efficient Filtering**: Tag-based filtering matches Shopify workflow
4. **Performance**: Smart refresh reduces unnecessary API calls
5. **Cleaner UI**: Consolidated filters, compact layout
6. **Future-Proof**: Normalized tag system scales with inventory growth
