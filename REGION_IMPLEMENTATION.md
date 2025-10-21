# Region-Based Access Control Implementation

## Overview
This document describes the region-based access control system that ensures users can only access stores and locations within their assigned region (Las Vegas or Hawaii).

## Database Schema

### New Tables
- **regions**: Stores region definitions
  - `id`: Primary key (e.g., 'las_vegas', 'hawaii')
  - `name`: Display name
  - `description`: Optional description
  - `is_active`: Whether the region is active

### Modified Tables
- **shopify_stores**: Added `region_id` column
- **user_shopify_assignments**: Added `region_id` column

### Constraints
- **Unique Index**: `idx_user_single_region` ensures each user can only be assigned to locations within one region
- **Trigger**: `enforce_single_region` validates that all assignments for a user belong to the same region

## Security Functions

### `user_can_access_region(_user_id, _region_id)`
- Returns boolean indicating if user can access a specific region
- Admins can access all regions
- Regular users can only access their assigned region

### Updated: `user_can_access_store_location`
- Now includes region validation
- Ensures users can only access stores within their assigned region

## Row Level Security (RLS)

### regions table
- Users can view their assigned region
- Admins can manage all regions

### shopify_stores table
- Updated policy to filter by region
- Users can only see stores in their assigned region
- Backward compatibility maintained for direct store assignments

## Frontend Components

### StoreContext.tsx
- Tracks `assignedRegion` and `assignedRegionName`
- Loads `availableStoresInRegion` based on user's region
- Filters locations by region

### RegionSelector.tsx
- Display-only component showing user's assigned region
- Badge with region information

### UserAssignmentManager.tsx
- Region selection as first step in user creation/editing
- Only shows stores within selected region
- Validates region selection before allowing store selection
- Enforces single region per user constraint

## Setup Instructions

### 1. Assign Regions to Stores

Run SQL to assign your stores to regions:

```sql
-- Update your stores with region assignments
UPDATE public.shopify_stores 
SET region_id = 'las_vegas' 
WHERE key IN ('las_vegas', '702', 'acslv');

UPDATE public.shopify_stores 
SET region_id = 'hawaii' 
WHERE key IN ('hawaii_store_key'); -- Replace with your Hawaii store keys
```

### 2. Backfill User Assignments

Update existing user assignments with regions:

```sql
-- Backfill existing assignments
UPDATE public.user_shopify_assignments usa
SET region_id = ss.region_id
FROM public.shopify_stores ss
WHERE usa.store_key = ss.key
AND usa.region_id IS NULL;
```

### 3. Verify Setup

```sql
-- Check region assignments
SELECT id, name, region_id FROM public.shopify_stores;

-- Check user assignments with regions
SELECT user_id, store_key, location_name, region_id 
FROM public.user_shopify_assignments;
```

## Usage

### For Administrators
1. Navigate to Admin > User Management
2. Create or edit a user
3. **Step 1**: Select region (Las Vegas or Hawaii)
4. **Step 2**: Select stores within that region
5. **Step 3**: Select locations within those stores
6. Save the user

The system will enforce:
- Users can only be assigned to one region
- Store selection is limited to stores in the selected region
- Attempting to assign a user to multiple regions will fail

### For Regular Users
- Users automatically see only stores in their assigned region
- Location selection is limited to their assigned region
- Store context automatically loads region information

## Validation

The system validates:
1. **Database Level**: Trigger prevents multi-region assignments
2. **RLS Level**: Policies enforce region-based access
3. **Application Level**: UI prevents invalid selections
4. **Function Level**: Security definer functions validate region access

## Error Handling

Common errors and solutions:

### "User can only be assigned to one region"
- This occurs when trying to assign a user to stores in different regions
- Solution: Remove existing assignments or choose stores in the same region

### "No stores available"
- This occurs when no stores are assigned to the selected region
- Solution: Update stores with proper region_id values

### "Access denied"
- User trying to access resources outside their region
- Solution: Verify user's region assignment in user_shopify_assignments table

## Migration Notes

The migration is backward compatible:
- Existing stores without region_id can still be accessed by admins
- Users with assignments to stores without region_id will need updates
- The system maintains direct store assignment checks for backward compatibility

## Future Enhancements

Potential improvements:
1. Multi-region support for specific admin users
2. Region-based reporting and analytics
3. Cross-region transfer workflows
4. Region-specific configuration settings
