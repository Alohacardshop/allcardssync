
# Navigation Cleanup: Remove Dead Routes and Migration Placeholders

## Summary
Remove all dead menu items, placeholder pages, and migration notices from admin and app navigation. Consolidate navigation configuration to prevent deprecated features from reappearing.

---

## Issues Found

| Location | Problem |
|----------|---------|
| `/admin/catalog` route | Shows "functionality moved" placeholder |
| AdminLayout sidebar | "Catalog" links to placeholder page |
| Command palette | Has catalog references that lead to dead/misleading pages |
| QuickActions | "Catalog Settings" button navigates to migrated feature |
| `/admin/ebay-settings` route | Redirect-only route (dead) |
| `CatalogTab.tsx` | Unused component showing migration notice |
| `CatalogMigrationPlaceholder.tsx` | Only used for dead routes |
| `PATHS.adminCatalog` | Route constant for removed feature |

---

## Changes

### 1. Remove `/admin/catalog` Route

**File: `src/routes/admin.tsx`**
- Delete the catalog route: `<Route path="catalog" ...>`
- Remove `CatalogMigrationPlaceholder` import
- Remove `/admin/ebay-settings` redirect route (dead)

### 2. Update AdminLayout Sidebar Navigation

**File: `src/components/layout/AdminLayout.tsx`**
- Remove `{ id: 'catalog', path: PATHS.adminCatalog, title: 'Catalog', icon: Database }` from `ADMIN_NAV_SECTIONS`
- Remove `adminCatalog` import from PATHS (now unused)

### 3. Rename "catalog" Section to "Data & Intake"

**File: `src/pages/Admin.tsx`**
- Rename `case 'catalog'` to `case 'data'`
- Keep `CatalogTabsSection` component but it now represents "Data & Intake" settings (TCG config, intake settings, APIs, vendors, categories)

### 4. Update AdminLayout Navigation to Match

**File: `src/components/layout/AdminLayout.tsx`**
- Change catalog entry to: `{ id: 'data', path: '${PATHS.admin}?section=data', title: 'Data & Intake', icon: Database }`
- This uses query-param navigation instead of a separate route

### 5. Update Command Palette

**File: `src/components/admin/AdminCommandPalette.tsx`**
- Update `nav-catalog` to:
  - id: `nav-data`
  - label: `Data & Intake`
  - description: `TCG database and intake settings`
  - action: `onNavigate?.('data')`
- Update `settings-tcg`:
  - action: `onNavigate?.('data')`

### 6. Update QuickActions

**File: `src/components/admin/QuickActions.tsx`**
- Change "Catalog Settings" to:
  - label: `Data Settings`
  - description: `TCG database & intake config`
  - onClick: `onNavigate('data')`

### 7. Remove Unused Path Constants

**File: `src/routes/paths.ts`**
- Remove `adminCatalog: '/admin/catalog'` from PATHS object

### 8. Delete Dead Files

**Files to delete:**
- `src/components/admin/CatalogTab.tsx` - Unused, only shows migration notice
- `src/components/CatalogMigrationPlaceholder.tsx` - No longer needed after route removal

---

## Navigation After Cleanup

### Admin Sidebar (ADMIN_NAV_SECTIONS)
| Section | Path | Status |
|---------|------|--------|
| Overview | `/admin` | Keep |
| Store | `/admin?section=store` | Keep |
| **Data & Intake** | `/admin?section=data` | **Renamed from Catalog** |
| Queue | `/admin?section=queue` | Keep |
| Users | `/admin?section=users` | Keep |
| Hardware | `/admin?section=hardware` | Keep |
| Regions | `/admin?section=regions` | Keep |
| System | `/admin?section=system` | Keep |

### Admin Tools (ADMIN_TOOLS)
All tools remain unchanged (Discord, Pending, Backfill, Inv Sync, Health)

### Admin Routes
| Route | Status |
|-------|--------|
| `/admin` | Keep |
| `/admin/catalog` | **Remove** |
| `/admin/notifications/discord` | Keep |
| `/admin/notifications/pending` | Keep |
| `/admin/shopify-backfill` | Keep |
| `/admin/inventory-sync` | Keep |
| `/admin/sync-health` | Keep |
| `/admin/ebay-settings` | **Remove** (was just a redirect) |

---

## Technical Details

### Files Modified
| File | Change |
|------|--------|
| `src/routes/admin.tsx` | Remove catalog and ebay-settings routes |
| `src/routes/paths.ts` | Remove `adminCatalog` constant |
| `src/components/layout/AdminLayout.tsx` | Update `ADMIN_NAV_SECTIONS` to use data section |
| `src/pages/Admin.tsx` | Rename catalog case to data |
| `src/components/admin/AdminCommandPalette.tsx` | Update navigation commands |
| `src/components/admin/QuickActions.tsx` | Update button labels |

### Files Deleted
| File | Reason |
|------|--------|
| `src/components/admin/CatalogTab.tsx` | Unused, only shows migration placeholder |
| `src/components/CatalogMigrationPlaceholder.tsx` | No longer referenced after cleanup |

---

## UX Impact

**Before:**
- Staff could click "Catalog" → land on "This feature has moved" page
- Dead-end experience, confusing and unprofessional

**After:**
- "Data & Intake" section shows working tools (TCG settings, intake config, vendors, categories)
- No migration notices in navigation
- Every menu item leads to functional content
- Staff never encounter "feature moved" pages via navigation
