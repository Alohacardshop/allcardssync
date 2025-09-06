# Build Scripts

## Intake Guardrails

### `check-intake-no-shopify.sh`

CI guardrail script that prevents accidental Shopify function calls in intake modules.

**Purpose**: Ensure intake flow remains DB-only by blocking any Shopify function invocations in intake-related files.

**Usage**:
```bash
# Run the check
./scripts/check-intake-no-shopify.sh

# Make executable if needed
chmod +x scripts/check-intake-no-shopify.sh
```

**What it checks**:
- Files matching: `src/**/*intake*`, `src/**/*Intake*`, etc.
- Patterns like: `functions.invoke(.*shopify`, `supabase.functions.invoke(.*shopify`

**Integration**:
- Runs automatically in GitHub Actions CI
- Should be added to package.json scripts when possible:
  ```json
  {
    "scripts": {
      "check:intake-no-shopify": "bash scripts/check-intake-no-shopify.sh"
    }
  }
  ```

**Policy Enforced**:
- ✅ **Allowed**: RPC calls (`supabase.rpc(...)`)
- ❌ **Prohibited**: Function calls (`supabase.functions.invoke(...shopify...)`)

**Why**: Intake should be DB-only. Shopify sync happens later when moving batch → inventory.