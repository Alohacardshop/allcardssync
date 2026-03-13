

# Fix Missing `image_url` Column on `intake_items`

## Problem
The Shopify sync edge function tries to write to `intake_items.image_url` but the column doesn't exist, causing repeated errors in logs.

## Solution
Add the missing column via a database migration:

```sql
ALTER TABLE public.intake_items
ADD COLUMN IF NOT EXISTS image_url TEXT;
```

Single migration, no code changes needed — the edge function already writes to this column, it just needs to exist.

