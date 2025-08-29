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
# Catalog functionality moved to external service
echo "ℹ️  Catalog functionality moved to Alohacardshop/alohacardshopcarddatabase"
echo ""

echo "🔄 Modern Sync System:"
psql "$SUPABASE_DB_URL" -c "select count(*) as total_jobs from sync_v3.jobs;" 2>/dev/null || echo "Failed to connect to sync_v3.jobs table"
echo ""

echo "🎮 Sync Games (v2):"
curl -s -X POST "http://localhost:54321/functions/v1/sync-games-v2" 2>/dev/null | jq -r '.job_id // "Failed"' || echo "Failed to test sync-games-v2"
echo ""

echo "🃏 Sync Sets (v2):"
curl -s -X POST "http://localhost:54321/functions/v1/sync-sets-v2" -H "Content-Type: application/json" -d '{"game":"mtg"}' 2>/dev/null | jq -r '.job_id // "Failed"' || echo "Failed to test sync-sets-v2"
echo ""

echo "🏥 Health Monitor:"
curl -s "http://localhost:54321/functions/v1/health-monitor" 2>/dev/null | jq -r '.status // "Failed"' || echo "Failed to test health-monitor"
echo ""

echo "🔧 JustTCG API Connectivity (Analytics Only):"
curl -s "http://localhost:54321/functions/v1/justtcg-health" 2>/dev/null | jq -r '.status // "API connectivity test failed"' || echo "JustTCG API health check failed"
echo ""

echo "📈 Sync Configuration:"
psql "$SUPABASE_DB_URL" -c "select key, value from sync_v3.config limit 3;" 2>/dev/null || echo "Failed to test sync configuration"
echo ""

echo "==== Modern sync system smoke tests completed ===="