

## Make Location Name Bigger

This is a straightforward styling update to improve the readability of the location name in the compact location selector dropdown.

### Current Issue
In the `CompactLocationSelector` component, the location name is displayed with:
- **`text-xs`** - Extra small text (0.75rem / 12px)
- **`max-w-20`** - Maximum width of 80px, causing truncation on longer location names

### Changes

**File: `src/components/CompactLocationSelector.tsx`**

Update the location name display styling:

| Element | Current | New |
|---------|---------|-----|
| Container text size | `text-xs` (12px) | `text-sm` (14px) |
| Location name max-width | `max-w-20` (80px) | `max-w-32` (128px) |

The updated code block:
```tsx
<div className="flex flex-col items-start text-sm">
  <span className="font-medium text-foreground">
    {assignedStoreName || "No Store"}
  </span>
  <span className="text-muted-foreground truncate max-w-32">
    {selectedLocationName}
  </span>
</div>
```

This increases the text from 12px to 14px and allows location names up to 128px wide before truncating, making them easier to read while keeping the compact design.

