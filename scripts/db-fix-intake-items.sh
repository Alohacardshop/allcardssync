#!/bin/bash
# Database Fix Script: Fix intake_items triggers and RPC function
# Usage: ./scripts/db-fix-intake-items.sh
#
# This script runs all necessary fixes for the updated_by column issue:
# 1. Recompiles triggers to recognize new columns
# 2. Recreates the send_intake_items_to_inventory RPC
# 3. Clears PostgreSQL prepared statement cache

set -e  # Exit on error

echo "🔧 Starting database fixes for intake_items..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running in Supabase project
if [ -f "supabase/config.toml" ]; then
  echo "${YELLOW}ℹ️  Detected Supabase project${NC}"
  echo "Run these commands in your Supabase SQL Editor:"
  echo "https://supabase.com/dashboard/project/dmpoandoydaqxhzdjnmk/sql/new"
  echo ""
  echo "Copy and paste each file's contents:"
  echo "1. db/fixes/recompile_intake_items_triggers.sql"
  echo "2. db/fixes/recreate_send_intake_items_to_inventory.sql"  
  echo "3. db/fixes/discard_all.sql"
  echo ""
  echo "Or run the migration:"
  echo "db/migrations/2025-10-29_add_updated_by_to_intake_items.sql"
  exit 0
fi

# For local PostgreSQL
echo "Step 1/3: Recompiling triggers..."
psql -f db/fixes/recompile_intake_items_triggers.sql
echo "${GREEN}✓ Triggers recompiled${NC}"
echo ""

echo "Step 2/3: Recreating RPC function..."
psql -f db/fixes/recreate_send_intake_items_to_inventory.sql
echo "${GREEN}✓ RPC function recreated${NC}"
echo ""

echo "Step 3/3: Clearing prepared statement cache..."
psql -f db/fixes/discard_all.sql
echo "${GREEN}✓ Cache cleared${NC}"
echo ""

echo "${GREEN}✅ All database fixes applied successfully!${NC}"
echo ""
echo "Next steps:"
echo "1. Hard refresh your browser (Ctrl+Shift+R)"
echo "2. Test 'Send to Inventory' functionality"
echo "3. Run ./scripts/db-test-updated-by.sh to verify"
