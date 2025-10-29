#!/bin/bash
# Test Script: Verify updated_by column is properly populated
# Usage: ./scripts/db-test-updated-by.sh [item_id]
#
# If no item_id provided, will test with a random item from intake_items

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ITEM_ID=$1

echo "🧪 Testing updated_by column functionality..."
echo ""

# Check if running in Supabase project
if [ -f "supabase/config.toml" ]; then
  echo "${YELLOW}ℹ️  For Supabase projects, run this SQL in your SQL Editor:${NC}"
  echo "https://supabase.com/dashboard/project/dmpoandoydaqxhzdjnmk/sql/new"
  echo ""
  echo "-- Test updated_by trigger"
  echo "DO \$\$"
  echo "DECLARE"
  echo "  test_item_id uuid;"
  echo "  test_updated_by text;"
  echo "BEGIN"
  echo "  -- Get a random item"
  if [ -n "$ITEM_ID" ]; then
    echo "  test_item_id := '$ITEM_ID'::uuid;"
  else
    echo "  SELECT id INTO test_item_id FROM public.intake_items WHERE deleted_at IS NULL LIMIT 1;"
  fi
  echo ""
  echo "  -- Update the item"
  echo "  UPDATE public.intake_items"
  echo "  SET processing_notes = 'Test update at ' || now()::text"
  echo "  WHERE id = test_item_id;"
  echo ""
  echo "  -- Check if updated_by was set"
  echo "  SELECT updated_by INTO test_updated_by"
  echo "  FROM public.intake_items"
  echo "  WHERE id = test_item_id;"
  echo ""
  echo "  IF test_updated_by IS NOT NULL THEN"
  echo "    RAISE NOTICE '✅ SUCCESS: updated_by is set to %', test_updated_by;"
  echo "  ELSE"
  echo "    RAISE EXCEPTION '❌ FAILED: updated_by is NULL after update';"
  echo "  END IF;"
  echo "END \$\$;"
  exit 0
fi

# For local PostgreSQL
if [ -z "$ITEM_ID" ]; then
  echo "No item_id provided, selecting a random item..."
  ITEM_ID=$(psql -t -c "SELECT id FROM public.intake_items WHERE deleted_at IS NULL LIMIT 1;")
  ITEM_ID=$(echo $ITEM_ID | xargs)  # Trim whitespace
  
  if [ -z "$ITEM_ID" ]; then
    echo "${RED}❌ No items found in intake_items table${NC}"
    exit 1
  fi
  
  echo "Using item_id: $ITEM_ID"
  echo ""
fi

# Run the test
echo "Running test query..."
RESULT=$(psql -t -c "
DO \$\$
DECLARE
  test_updated_by text;
BEGIN
  -- Update the item
  UPDATE public.intake_items
  SET processing_notes = 'Test update at ' || now()::text
  WHERE id = '$ITEM_ID'::uuid;
  
  -- Check if updated_by was set
  SELECT updated_by INTO test_updated_by
  FROM public.intake_items
  WHERE id = '$ITEM_ID'::uuid;
  
  IF test_updated_by IS NOT NULL THEN
    RAISE NOTICE '✅ SUCCESS: updated_by is set to %', test_updated_by;
  ELSE
    RAISE EXCEPTION '❌ FAILED: updated_by is NULL after update';
  END IF;
END \$\$;
" 2>&1)

# Check result
if echo "$RESULT" | grep -q "SUCCESS"; then
  echo "${GREEN}$RESULT${NC}"
  echo ""
  echo "${GREEN}✅ Test passed! The updated_by column is working correctly.${NC}"
  exit 0
else
  echo "${RED}$RESULT${NC}"
  echo ""
  echo "${RED}❌ Test failed! The updated_by column is not being populated.${NC}"
  echo ""
  echo "Troubleshooting:"
  echo "1. Ensure the migration has been run: db/migrations/2025-10-29_add_updated_by_to_intake_items.sql"
  echo "2. Run the fix script: ./scripts/db-fix-intake-items.sh"
  echo "3. Verify trigger exists: SELECT * FROM pg_trigger WHERE tgname = 'intake_items_audit_updated_by';"
  exit 1
fi
