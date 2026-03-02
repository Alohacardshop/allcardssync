

## Make Graded Comics the Default on Intake Tab

Two quick changes in `src/pages/Index.tsx`:

1. **Line 12**: Change `collectibleType` default from `'cards'` to `'comics'`
2. **Line 14**: Change `comicCondition` default from `'raw'` to `'graded'`

This will open the Intake page with the Comics tab selected and the Graded sub-tab active by default.

