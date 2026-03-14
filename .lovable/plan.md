

## Fix: "Connection Error" on PIN Login

### Root Cause

The `pin-login` edge function returns HTTP status codes like **401** (invalid credentials) and **429** (locked out) for expected validation failures. However, `supabase.functions.invoke()` treats **any non-2xx response** as a `FunctionsHttpError`, throwing a generic error with the message `"Edge Function returned a non-2xx status code"`. The actual JSON body (`{"ok":false,"error":"Invalid name or PIN"}`) is swallowed and never reaches the frontend's error handling logic.

I confirmed this by running a live browser test:
- Entered name "test", PIN "4321"
- Edge function returned `401` with body `{"ok":false,"error":"Invalid name or PIN"}`
- Frontend caught `FunctionsHttpError` and displayed the generic message instead of the actual error

This is why Zach sees "connection error" — the `invokeError.message` is the generic Supabase client message, not the structured error from the function.

### Fix

**Change the `pin-login` edge function to always return HTTP 200** for all handled cases (success, invalid PIN, locked account). The `ok` field in the JSON body already distinguishes success from failure. Reserve non-2xx codes only for truly unexpected server errors.

### Files to Change

**`supabase/functions/pin-login/index.ts`**
- Change all `status: 401` responses to `status: 200` (invalid credentials, wrong PIN)
- Change `status: 429` response to `status: 200` (account locked)
- Keep `status: 400` for malformed requests (missing fields, bad PIN format) — though these could also be 200
- Keep `status: 500` for unexpected errors

This is a single-file change — the frontend already handles `data.ok === false`, `data.locked`, and `data.error` correctly. Once the function returns 200, those fields will flow through properly.

