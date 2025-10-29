#!/bin/bash
# Database Fix Script: Fix intake_items triggers and RPC function
# Usage: ./scripts/db-fix-intake-items.sh
#
# This script runs all necessary fixes for the updated_by column issue:
# 1. Recompiles ALL trigger functions attached to intake_items to recognize new columns
# 2. Recreates the send_intake_items_to_inventory RPC
# 3. Clears PostgreSQL prepared statement cache
#
# SAFE FOR SUPABASE: All SQL is compatible with Supabase SQL Editor (no psql-specific commands)

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
  echo "Run these SQL files in your Supabase SQL Editor:"
  echo "https://supabase.com/dashboard/project/dmpoandoydaqxhzdjnmk/sql/new"
  echo ""
  echo "📋 Copy and paste IN THIS ORDER:"
  echo ""
  echo "1️⃣  db/fixes/recompile_intake_items_triggers.sql"
  echo "   (Recompiles all 10 trigger functions)"
  echo ""
  echo "2️⃣  db/fixes/recreate_send_intake_items_to_inventory.sql"
  echo "   (Updates the RPC function)"
  echo ""
  echo "3️⃣  db/fixes/discard_all.sql"
  echo "   (Clears prepared statement cache)"
  echo ""
  echo "${GREEN}✅ After running all 3 files, the 'record new has no field updated_by' error will be fixed${NC}"
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
