#!/bin/bash
# Test Script: Verify updated_by column functionality
# Usage: ./scripts/db-test-updated-by.sh [item_id]
# 
# This script verifies that the updated_by column works correctly.
# 
# WITHOUT item_id: Tests with a random item
# WITH item_id: Tests with a specific item
#
# Examples:
#   ./scripts/db-test-updated-by.sh
#   ./scripts/db-test-updated-by.sh 12345678-1234-1234-1234-123456789abc

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
  echo "${YELLOW}ℹ️  Detected Supabase project${NC}"
  echo ""
  echo "🔗 Open Supabase SQL Editor:"
  echo "   https://supabase.com/dashboard/project/dmpoandoydaqxhzdjnmk/sql/new"
  echo ""
  
  if [ -n "$ITEM_ID" ]; then
    echo "📋 Copy and paste: db/tests/test_updated_by_with_id.sql"
    echo "   ${YELLOW}Remember to replace YOUR-ITEM-ID-HERE with: $ITEM_ID${NC}"
  else
    echo "📋 Copy and paste: db/tests/test_updated_by_fix.sql"
    echo "   ${GREEN}(Tests with a random item - no editing needed)${NC}"
  fi
  
  echo ""
  echo "${GREEN}This will:${NC}"
  echo "  1. Select a test item"
  echo "  2. Update it to trigger the updated_by column"
  echo "  3. Verify updated_by was set correctly"
  echo "  4. Show the 5 most recent items"
  echo ""
  exit 0
fi

# For local PostgreSQL
echo "Running test against local PostgreSQL..."
echo ""

if [ -n "$ITEM_ID" ]; then
  echo "📝 Testing specific item: $ITEM_ID"
  echo ""
  
  # Create temporary SQL with the specific ID
  cat db/tests/test_updated_by_with_id.sql | \
    sed "s/YOUR-ITEM-ID-HERE/$ITEM_ID/g" | \
    psql
    
else
  echo "📝 Testing with random item"
  echo ""
  psql -f db/tests/test_updated_by_fix.sql
fi

echo ""
echo "${GREEN}✅ Test completed${NC}"
