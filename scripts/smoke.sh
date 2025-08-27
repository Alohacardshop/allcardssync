#!/usr/bin/env bash
set -euo pipefail

echo "==== AllCards Sync - Smoke Tests ===="
echo ""

# Check if required environment variables are set
if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "❌ SUPABASE_DB_URL not set"
  exit 1
fi

echo "✅ Environment check passed"
echo ""

echo "🔍 Search (mtg):"
curl -s "http://localhost:54321/functions/v1/catalog-search?game=mtg&name=Bolt&limit=1" | jq length 2>/dev/null || echo "Failed to connect to search endpoint"
echo ""

echo "📊 Stats (mtg):"
psql "$SUPABASE_DB_URL" -c "select * from catalog_v2.stats('mtg');" 2>/dev/null || echo "Failed to connect to database"
echo ""

echo "🚀 Queue all (mtg):"
curl -s -X POST "http://localhost:54321/functions/v1/catalog-sync-justtcg?game=magic-the-gathering" 2>/dev/null | jq -r '.queued_sets // "Failed"' || echo "Failed to queue sync"
echo ""

echo "📋 Status (mtg):"
curl -s "http://localhost:54321/functions/v1/catalog-sync-status?game=mtg&limit=5" | jq . 2>/dev/null || echo "Failed to get status"
echo ""

echo "==== Smoke tests completed ===="