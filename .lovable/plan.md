

# Fix Dual Sidebar Overlap on Admin Page

## Problem
The Admin page is currently wrapped inside `AppShell`, which renders the main application sidebar (Home, Intake, Inventory, etc.). But the Admin page also has its own internal sidebar for admin-specific sections (Overview, Store, Catalog, Queue, etc.). This creates two overlapping sidebars where the main app sidebar covers part of the admin sidebar.

## Solution Options

### Option A: Hide Main App Navigation on Admin Page (Recommended)
Use the existing `hideNav` prop on `AppShell` for the Admin route, so only the Admin sidebar shows. The Admin page already has its own "Back to Dashboard" link.

**Pros:**
- Minimal code change (just one line)
- Admin gets a full-screen dedicated experience
- No layout conflicts

**Cons:**
- User needs to click "Back to Dashboard" to return to main nav

### Option B: Remove Admin's Internal Sidebar
Remove the Admin-specific sidebar and use the main app sidebar instead, switching sections via URL routes.

**Cons:**
- Major rework
- Loses the current section-based tab switching

## Recommended: Option A

### Technical Changes

**File: `src/App.tsx`**

Change the Admin route from:
```tsx
<Route path="/admin" element={<AdminGuard><Admin /></AdminGuard>} />
```

To use `hideNav`:
```tsx
<Route path="/admin" element={
  <AdminGuard>
    <AppShell hideNav>
      <Admin />
    </AppShell>
  </AdminGuard>
} />
```

Wait - actually looking more closely, the Admin page is inside a `/*` catch-all route that wraps everything in `AppShell`. The fix should be to move Admin outside of the `AppShell` wrapper entirely.

### Corrected Technical Change

**File: `src/App.tsx`**

Move the admin routes BEFORE the catch-all protected route so they render without `AppShell`:

```tsx
{/* Admin routes - WITHOUT AppShell wrapper (has its own layout) */}
<Route path="/admin/*" element={
  <AuthGuard>
    <AdminGuard>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="" element={<Admin />} />
          <Route path="catalog" element={<CatalogMigrationPlaceholder />} />
          <Route path="notifications/discord" element={<DiscordNotifications />} />
          <Route path="notifications/pending" element={<PendingNotifications />} />
          <Route path="shopify-backfill" element={<ShopifyBackfill />} />
          <Route path="inventory-sync" element={<InventorySyncDashboard />} />
        </Routes>
      </Suspense>
    </AdminGuard>
  </AuthGuard>
} />
```

This way, Admin pages render without the main `AppShell` (which includes the main sidebar), and only show the Admin-specific sidebar.

### Additional Enhancement

Also update the Admin page to include its own header for consistency:

**File: `src/pages/Admin.tsx`**

Add a minimal header with the logo and "Back to Dashboard" at the top left of the admin area for better navigation context.

## Result After Fix

- Admin page will use its full-width layout with only the admin sidebar
- No more overlapping sidebars
- Clean separation between main app navigation and admin navigation
- "Back to Dashboard" link already exists in admin sidebar footer

