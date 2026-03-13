

## Problem

When creating a user, the toast shows a generic error: "Edge Function returned a non-2xx status code" instead of the actual message ("User with this email already exists"). This happens because `supabase.functions.invoke` throws a `FunctionsHttpError` when the edge function returns a non-2xx status, and the response body (which contains the real error) isn't being read.

The edge function returns `{ ok: false, error: "..." }` with status 500, but the client-side code at line 443 catches the generic `FunctionsHttpError` before it can check `data.ok`.

## Fix

In `UserAssignmentManager.tsx`, update the error handling for both create and update operations to read the response body from `FunctionsHttpError` before throwing:

**File: `src/components/UserAssignmentManager.tsx`** (around lines 434-444 and 396-407)

For the create user call and the update user call, when `error` is a `FunctionsHttpError`, read the JSON body to extract the actual error message:

```typescript
const { data, error } = await supabase.functions.invoke('create-user-admin', { ... });

if (error) {
  // Try to read the actual error from the response body
  const errorBody = await error.context?.json?.().catch(() => null);
  const message = errorBody?.error || error.message;
  throw new Error(message);
}
if (!data?.ok) throw new Error(data?.error || 'Unknown error');
```

Apply the same pattern to the `user-assignment-admin` invoke call.

This way, users will see helpful messages like "User with this email already exists" instead of the generic edge function error.

