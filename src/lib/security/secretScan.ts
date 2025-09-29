/**
 * Pre-commit secret scanning utility
 * Helps prevent accidental commits of sensitive data
 */

export interface SecretPattern {
  name: string;
  pattern: RegExp;
  description: string;
}

// Common secret patterns to detect
export const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: 'Supabase URL',
    pattern: /https:\/\/[a-zA-Z0-9-]+\.supabase\.co/g,
    description: 'Supabase project URL'
  },
  {
    name: 'Supabase Key',
    pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    description: 'Supabase JWT token'
  },
  {
    name: 'Shopify Access Token',
    pattern: /shpat_[a-fA-F0-9]{32}/g,
    description: 'Shopify private app access token'
  },
  {
    name: 'Shopify API Key',
    pattern: /[a-fA-F0-9]{32}/g,
    description: 'Generic 32-character hex key'
  },
  {
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    description: 'AWS access key ID'
  },
  {
    name: 'AWS Secret Key',
    pattern: /[a-zA-Z0-9/+=]{40}/g,
    description: 'AWS secret access key'
  },
  {
    name: 'Generic API Key',
    pattern: /(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret[_-]?key)\s*[:=]\s*['"][a-zA-Z0-9_-]+['"]?/gi,
    description: 'Generic API key or token'
  },
  {
    name: 'Environment Variable Secret',
    pattern: /(VITE_|NEXT_PUBLIC_|REACT_APP_).*(KEY|TOKEN|SECRET|PASSWORD)\s*=\s*['"'][^'"']+['"']/gi,
    description: 'Environment variable with sensitive data'
  }
];

export interface ScanResult {
  file: string;
  line: number;
  column: number;
  pattern: string;
  match: string;
  description: string;
}

export function scanText(text: string, filename: string = 'unknown'): ScanResult[] {
  const results: ScanResult[] = [];
  const lines = text.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    
    for (const secretPattern of SECRET_PATTERNS) {
      const matches = [...line.matchAll(secretPattern.pattern)];
      
      for (const match of matches) {
        // Skip if it's clearly a placeholder or example
        if (isPlaceholder(match[0])) {
          continue;
        }

        results.push({
          file: filename,
          line: lineIndex + 1,
          column: match.index || 0,
          pattern: secretPattern.name,
          match: match[0],
          description: secretPattern.description
        });
      }
    }
  }

  return results;
}

export function scanFiles(files: Array<{ path: string; content: string }>): ScanResult[] {
  const allResults: ScanResult[] = [];

  for (const file of files) {
    const results = scanText(file.content, file.path);
    allResults.push(...results);
  }

  return allResults;
}

function isPlaceholder(value: string): boolean {
  const placeholderPatterns = [
    /your[_-]?key/i,
    /your[_-]?token/i,
    /your[_-]?secret/i,
    /replace[_-]?with/i,
    /example/i,
    /placeholder/i,
    /dummy/i,
    /test/i,
    /xxx+/i,
    /\*+/i,
    /<[^>]+>/,
    /\[.*\]/,
    /\{.*\}/,
    /localhost/i,
    /127\.0\.0\.1/,
    /0\.0\.0\.0/
  ];

  return placeholderPatterns.some(pattern => pattern.test(value));
}

export function generateSecretScanReport(results: ScanResult[]): string {
  if (results.length === 0) {
    return '✅ No potential secrets detected.';
  }

  let report = `❌ Found ${results.length} potential secret(s):\n\n`;

  const groupedResults = results.reduce((groups, result) => {
    if (!groups[result.file]) {
      groups[result.file] = [];
    }
    groups[result.file].push(result);
    return groups;
  }, {} as Record<string, ScanResult[]>);

  for (const [file, fileResults] of Object.entries(groupedResults)) {
    report += `📁 ${file}:\n`;
    
    for (const result of fileResults) {
      report += `  Line ${result.line}, Col ${result.column}: ${result.pattern}\n`;
      report += `    ${result.description}\n`;
      report += `    Match: ${result.match.substring(0, 50)}${result.match.length > 50 ? '...' : ''}\n\n`;
    }
  }

  report += '\n⚠️  Please review these potential secrets before committing.\n';
  report += '💡 Add legitimate secrets to .env.example as placeholders.\n';

  return report;
}

// Example pre-commit hook integration
export function createPreCommitHook(): string {
  return `#!/bin/sh
# Pre-commit secret scan hook
# Add this to .git/hooks/pre-commit and make it executable

echo "🔍 Scanning for secrets..."

# Get list of staged files
staged_files=$(git diff --cached --name-only --diff-filter=ACM | grep -E "\\.(js|ts|tsx|jsx|json|env|yaml|yml)$")

if [ -z "$staged_files" ]; then
  echo "✅ No relevant files to scan"
  exit 0
fi

# Run secret scan (this would need to be implemented as a CLI tool)
# For now, this is a placeholder showing the concept
echo "$staged_files" | while read file; do
  if [ -f "$file" ]; then
    # This would call the secret scanner
    echo "Scanning: $file"
    
    # Check for obvious patterns
    if grep -q "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" "$file"; then
      echo "❌ Potential JWT token found in $file"
      echo "Please remove secrets before committing"
      exit 1
    fi
    
    if grep -q "shpat_[a-fA-F0-9]\\{32\\}" "$file"; then
      echo "❌ Potential Shopify token found in $file"
      echo "Please remove secrets before committing"  
      exit 1
    fi
  fi
done

echo "✅ Secret scan passed"
exit 0
`;
}