#!/bin/bash

echo "🔍 INTAKE SETUP VERIFICATION"
echo "==========================="

echo ""
echo "1️⃣ Running CI guardrail check..."
if bash scripts/check-intake-no-shopify.sh; then
    echo "✅ PASS: No prohibited Shopify calls in intake modules"
else
    echo "❌ FAIL: Shopify calls detected in intake - fix before proceeding"
    exit 1
fi

echo ""
echo "2️⃣ Checking E2E test files exist..."
if [[ -f "tests/intake_add_to_batch.spec.ts" && -f "tests/inventory_send_to_shopify.spec.ts" ]]; then
    echo "✅ PASS: E2E test files present"
else
    echo "❌ FAIL: Missing E2E test files"
    exit 1
fi

echo ""  
echo "3️⃣ Checking SQL verification script exists..."
if [[ -f "sql/verify/rpc_definer_verification.sql" ]]; then
    echo "✅ PASS: SQL verification script present"
else
    echo "❌ FAIL: Missing SQL verification script"
    exit 1
fi

echo ""
echo "4️⃣ Checking GitHub workflow exists..."
if [[ -f ".github/workflows/intake-guardrails.yml" ]]; then
    echo "✅ PASS: GitHub Actions workflow present"
else
    echo "❌ FAIL: Missing GitHub Actions workflow"
fi

echo ""
echo "5️⃣ Playwright configuration..."
if [[ -f "playwright.config.ts" ]]; then
    echo "✅ PASS: Playwright config present"
    if command -v npx >/dev/null 2>&1; then
        echo "  Testing Playwright installation..."
        if npx playwright --version >/dev/null 2>&1; then
            echo "✅ PASS: Playwright installed"
        else
            echo "⚠️  INFO: Run 'npx playwright install' to install browsers"
        fi
    fi
else
    echo "❌ FAIL: Missing Playwright config"
fi

echo ""
echo "🎯 NEXT STEPS FOR MANUAL VERIFICATION:"
echo "======================================"
echo ""
echo "📊 1. Run SQL verification in Supabase:"
echo "   • Open Supabase SQL Editor"  
echo "   • Copy/paste contents of: sql/verify/rpc_definer_verification.sql"
echo "   • Run the script - all checks should show ✅ PASS"
echo ""
echo "🌐 2. Test in browser (Network tab open):"
echo "   • Go to Graded Card Intake"
echo "   • Fill form and click 'Add to Batch'"
echo "   • Verify: Only RPC call, no /functions/v1/* requests"
echo "   • Check: New item appears in batch list"
echo ""
echo "🤖 3. Run E2E tests:"
echo "   • npx playwright test tests/intake_add_to_batch.spec.ts"
echo "   • npx playwright test tests/inventory_send_to_shopify.spec.ts"
echo ""
echo "📝 4. Include verification screenshots in PR description"

echo ""
echo "✅ Setup verification complete!"
echo "Ready for manual testing and PR creation."