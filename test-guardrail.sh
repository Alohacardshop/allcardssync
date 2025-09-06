#!/bin/bash

# Test the intake guardrail script

echo "🧪 Testing the intake guardrail script..."

# Make the script executable
chmod +x scripts/check-intake-no-shopify.sh

echo ""
echo "1️⃣ Testing with clean codebase (should pass):"
scripts/check-intake-no-shopify.sh

echo ""
echo "2️⃣ Creating a test violation to verify detection..."

# Create a temporary test file with a violation
mkdir -p src/components/test
cat > src/components/test/TestIntake.tsx << 'EOF'
// Test file with Shopify violation
import { supabase } from '@/integrations/supabase/client';

export function TestIntake() {
  const handleSubmit = async () => {
    // This should be detected as a violation
    await supabase.functions.invoke('shopify-sync-inventory', {
      body: { test: true }
    });
  };
  
  return <div>Test</div>;
}
EOF

echo "Created test violation file..."

echo ""
echo "3️⃣ Running guardrail check (should fail and detect violation):"
if scripts/check-intake-no-shopify.sh; then
    echo "❌ ERROR: Guardrail failed to detect the violation!"
    exit 1
else
    echo "✅ SUCCESS: Guardrail correctly detected the violation!"
fi

echo ""
echo "4️⃣ Cleaning up test file..."
rm -rf src/components/test/

echo ""
echo "5️⃣ Running final check (should pass again):"
scripts/check-intake-no-shopify.sh

echo ""
echo "🎉 Guardrail script test completed successfully!"
echo "The script correctly detects and blocks Shopify function calls in intake modules."