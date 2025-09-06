#!/bin/bash

# CI guardrail: Block accidental Shopify calls from intake modules
# This script fails if any intake-related file contains Shopify function invocations

set -e

echo "🔍 Checking intake modules for prohibited Shopify function calls..."

# Define patterns to search for
SHOPIFY_PATTERNS=(
    "functions\.invoke\(.*shopify"
    "functions\.invoke\(.*'shopify"
    "functions\.invoke\(.*\"shopify"
    "supabase\.functions\.invoke\(.*shopify"
    "supabase\.functions\.invoke\(.*'shopify"
    "supabase\.functions\.invoke\(.*\"shopify"
)

# Define file patterns to check (intake-related files)
FILE_PATTERNS=(
    "src/**/*intake*"
    "src/**/*Intake*"
    "src/**/intake*"
    "src/components/*Intake*"
    "src/components/intake*"
    "src/pages/*Intake*"
    "src/hooks/*intake*"
    "src/lib/*intake*"
)

VIOLATIONS_FOUND=0

# Check each pattern combination
for file_pattern in "${FILE_PATTERNS[@]}"; do
    for shopify_pattern in "${SHOPIFY_PATTERNS[@]}"; do
        echo "  Checking $file_pattern for pattern: $shopify_pattern"
        
        # Use find and grep to search (fallback if git grep fails)
        if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
            # In git repo - use git grep
            if git grep -nE "$shopify_pattern" -- $file_pattern 2>/dev/null; then
                echo "❌ VIOLATION: Found prohibited Shopify function call in intake module!"
                VIOLATIONS_FOUND=1
            fi
        else
            # Not in git repo - use regular grep
            if find . -path "./node_modules" -prune -o -path "$file_pattern" -type f -print0 2>/dev/null | \
               xargs -0 grep -nE "$shopify_pattern" 2>/dev/null; then
                echo "❌ VIOLATION: Found prohibited Shopify function call in intake module!"
                VIOLATIONS_FOUND=1
            fi
        fi
    done
done

if [ $VIOLATIONS_FOUND -eq 1 ]; then
    echo ""
    echo "🚨 CI GUARDRAIL FAILURE: Shopify function calls detected in intake modules!"
    echo ""
    echo "POLICY: Intake modules (Add to Batch) must be DB-only and cannot call Shopify functions."
    echo "Shopify sync should only happen when moving from batch → inventory."
    echo ""
    echo "Files that should NOT call Shopify functions:"
    echo "  - src/components/*Intake*.tsx"
    echo "  - src/components/intake*.tsx" 
    echo "  - Any file with 'intake' in the name/path"
    echo ""
    echo "✅ Allowed: RPC calls (supabase.rpc(...))"
    echo "❌ Prohibited: Function calls (supabase.functions.invoke(...shopify...))"
    echo ""
    exit 1
fi

echo "✅ All intake modules are clean - no prohibited Shopify calls found!"
echo "🛡️  Intake → Batch flow remains DB-only as designed."