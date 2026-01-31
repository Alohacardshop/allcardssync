
# Plan: Restrict Discord Notifications to Business Hours (8am - 7pm)

## Summary
Add business hours checking (8am - 7pm) to the Discord test button and the flush-pending-notifications edge function so notifications are only sent during operating hours.

## Changes

### 1. Update DiscordTestButton Component
**File:** `src/components/admin/DiscordTestButton.tsx`

- Import `useRegionalDateTime` hook to check if store is open
- Add a visual indicator showing current store status
- Disable the button when outside business hours (8am - 7pm)
- Show a helpful message explaining when notifications can be sent

**Behavior:**
- Button is active between 8am - 7pm in the region's timezone
- When disabled, shows "Store Closed - Available 8am-7pm"
- Uses the existing `isStoreOpen()` function from `useRegionalDateTime`

### 2. Update Business Hours Default
**File:** `src/hooks/useRegionSettings.ts`

- Change the default `start` from `10` to `8` (8am instead of 10am)
- Keep `end` at `19` (7pm)

This ensures new regions default to 8am-7pm business hours.

### 3. Update Edge Function Business Hours Check
**File:** `supabase/functions/flush-pending-notifications/index.ts`

- Add a business hours check before sending notifications
- Check the region's configured business hours from `region_settings`
- Only process notifications if currently within business hours (8am-7pm) for that region
- Return early with a message if called outside business hours

**New helper function:**
```text
isWithinBusinessHours(regionId, supabase)
├─ Fetch region's timezone from settings
├─ Get current hour in that timezone
└─ Return true if hour >= 8 AND hour < 19
```

### 4. Update useRegionalDateTime Hook
**File:** `src/hooks/useRegionalDateTime.ts`

- Update `isStoreOpen()` to use the configured business hours (which will now default to 8am)
- Ensure consistency with the edge function logic

---

## Technical Details

### Business Hours Logic
- **Start:** 8:00 AM (hour >= 8)
- **End:** 7:00 PM (hour < 19)
- **Timezone:** Region-specific (Pacific/Honolulu for Hawaii, America/Los_Angeles for Vegas)
- **Closed days:** Sundays (existing behavior preserved)

### UI Changes
The test button will show:
- **Open:** Normal "Send Test Notification" button
- **Closed:** Disabled button with tooltip "Store Closed - Available 8am-7pm"
