#!/bin/bash

# Setup Git hooks for secret scanning and code quality
# Run this script once after cloning the repository

echo "🔧 Setting up Git hooks..."

# Create .git/hooks directory if it doesn't exist
mkdir -p .git/hooks

# Create pre-commit hook for secret scanning
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
# Pre-commit secret scan hook
# Prevents committing sensitive data like API keys and tokens

echo "🔍 Scanning for secrets..."

# Get list of staged files (only text files that could contain secrets)
staged_files=$(git diff --cached --name-only --diff-filter=ACM | grep -E "\.(js|ts|tsx|jsx|json|env|yaml|yml|md|txt)$")

if [ -z "$staged_files" ]; then
  echo "✅ No relevant files to scan"
  exit 0
fi

# Function to check for secrets in a file
check_secrets() {
  local file="$1"
  local found_secrets=false
  
  # Skip files that are clearly safe
  if [[ "$file" =~ (package-lock\.json|yarn\.lock|\.min\.) ]]; then
    return 0
  fi
  
  # Check for JWT tokens (Supabase keys)
  if grep -q "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\." "$file"; then
    echo "❌ Potential JWT token found in $file"
    found_secrets=true
  fi
  
  # Check for Shopify tokens
  if grep -q "shpat_[a-fA-F0-9]\{32\}" "$file"; then
    echo "❌ Potential Shopify access token found in $file"
    found_secrets=true
  fi
  
  # Check for Supabase URLs (should only be in .env.example as placeholder)
  if grep -q "https://[a-zA-Z0-9-]\+\.supabase\.co" "$file" && [[ "$file" != ".env.example" ]]; then
    echo "❌ Supabase URL found in $file (should only be in .env.example)"
    found_secrets=true
  fi
  
  # Check for AWS keys
  if grep -q "AKIA[0-9A-Z]\{16\}" "$file"; then
    echo "❌ Potential AWS access key found in $file"
    found_secrets=true
  fi
  
  # Check for generic API keys/secrets
  if grep -qE "(api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*['\"][^'\"]{20,}['\"]" "$file"; then
    # Skip if it looks like a placeholder
    if ! grep -qE "(your[_-]?key|placeholder|example|xxx+|test)" "$file"; then
      echo "⚠️  Potential API key/token found in $file"
      echo "   Please verify this is not a real secret"
    fi
  fi
  
  if [ "$found_secrets" = true ]; then
    return 1
  fi
  
  return 0
}

# Check each staged file
secrets_found=false
echo "$staged_files" | while IFS= read -r file; do
  if [ -f "$file" ]; then
    if ! check_secrets "$file"; then
      secrets_found=true
    fi
  fi
done

# Exit if secrets were found
if [ "$secrets_found" = true ]; then
  echo ""
  echo "🚫 Commit blocked due to potential secrets detected"
  echo ""
  echo "📋 To fix this:"
  echo "   1. Remove any real API keys, tokens, or secrets from your files"
  echo "   2. Add placeholders to .env.example instead of real values"
  echo "   3. Use environment variables at runtime"
  echo "   4. Add sensitive files to .gitignore"
  echo ""
  echo "💡 If this is a false positive, you can bypass with:"
  echo "   git commit --no-verify"
  echo ""
  exit 1
fi

echo "✅ Secret scan passed"
exit 0
EOF

# Make the pre-commit hook executable
chmod +x .git/hooks/pre-commit

echo "✅ Pre-commit hook installed successfully!"
echo ""
echo "📋 The hook will now:"
echo "   • Scan staged files for potential secrets before each commit"
echo "   • Block commits containing JWT tokens, API keys, or Supabase URLs"
echo "   • Allow you to bypass with --no-verify if needed"
echo ""
echo "💡 To bypass the hook for a single commit, use:"
echo "   git commit --no-verify"
echo ""
echo "🔒 Keep your secrets safe!"