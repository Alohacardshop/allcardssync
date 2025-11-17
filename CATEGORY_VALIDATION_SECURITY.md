# Category Detection & Input Validation Security

## Overview
Enhanced category detection system with smart matching and comprehensive input validation to handle data from PSA, CGC, and other third-party APIs safely for TCG and Comics categories.

## Security Improvements

### 1. Smart Category Matching
**File**: `src/utils/categoryMapping.ts`

#### Features:
- **Unicode Normalization**: Handles special characters (é, ñ, ™, ®)
- **Fuzzy Matching**: Detects variations like "Pokemon" vs "Pokémon" vs "PKMN"
- **Input Validation**: 
  - Type checking
  - Length limits (200 chars)
  - Safe character filtering

#### Examples:
```typescript
// All of these correctly detect as 'tcg':
detectMainCategory('Pokémon')       // With accent
detectMainCategory('Pokemon')       // Without accent
detectMainCategory('POKEMON')       // Uppercase
detectMainCategory('  pokemon  ')  // Extra whitespace
detectMainCategory('Pokémon™')     // With trademark

// Variations handled:
detectMainCategory('Magic the Gathering')  // tcg
detectMainCategory('Magic: The Gathering') // tcg
detectMainCategory('MTG')                  // tcg
detectMainCategory('M:TG')                 // tcg
```

### 2. PSA Data Sanitization
**File**: `src/lib/psaNormalization.ts`

#### Security Features:
- **XSS Prevention**:
  - Removes `<script>`, `<iframe>`, `<object>`, `<embed>` tags
  - Strips event handlers (`onclick`, `onerror`, etc.)
  - Removes `javascript:` protocol
  
- **Injection Protection**:
  - Sanitizes all text fields
  - URL encoding for external links
  - Character whitelist filtering

- **Data Validation**:
  - Zod schemas for type safety
  - Maximum length enforcement
  - Required field validation

#### Example:
```typescript
// Malicious input from PSA API:
const malicious = {
  brandTitle: '<script>alert("xss")</script>Pokemon',
  subject: 'Pikachu<iframe src="evil.com"></iframe>',
  imageUrl: 'javascript:alert("xss")'
};

// Sanitized output:
const safe = normalizePSAData(malicious);
// safe.brandTitle = "Pokemon"
// safe.subject = "Pikachu"
// safe.imageUrl = undefined (invalid URL rejected)
```

### 3. Sub-Category Selection Security

#### Features:
- **Automatic Main Category Detection**: When user selects "Pokemon" sub-category, main category auto-sets to "TCG"
- **Database Validation**: Main category ID verified against database
- **Type Safety**: TypeScript ensures correct category IDs

## Testing

Run category detection tests:
```bash
npm test src/utils/categoryMapping.test.ts
```

### Test Coverage:
- ✅ Unicode character handling (é, ñ, etc.)
- ✅ Case insensitivity
- ✅ Whitespace normalization
- ✅ Special character removal (™, ®, etc.)
- ✅ Null/undefined handling
- ✅ Long string safety
- ✅ Real PSA/CGC API data formats
- ✅ Injection attack prevention

## API Data Examples

### PSA API Format:
```json
{
  "brandTitle": "1999 Pokemon Base Set",
  "subject": "Charizard",
  "category": "Gaming",
  "certNumber": "12345678"
}
```
**Detected**: `tcg` → Sub-category: `Pokemon`

### CGC API Format:
```json
{
  "brand": "Pokemon - Base Set",
  "subject": "Charizard Holo",
  "grade": "9.5"
}
```
**Detected**: `tcg` → Sub-category: `Pokemon`

## Validation Rules

### Category Detection:
1. **Input Sanitization**: Remove dangerous characters and tags
2. **Unicode Normalization**: Convert é→e, ñ→n, etc.
3. **Smart Matching**: Check against normalized keyword lists
4. **Default Fallback**: Return 'tcg' if no match found

### Field Limits:
- Brand/Title: 100 characters
- Subject: 100 characters
- Category: 100 characters
- Card Number: 50 characters
- Year: 4 characters
- Grade: 20 characters
- Cert Number: 50 characters

### Blocked Content:
- Script tags
- Event handlers
- JavaScript protocol
- Iframe/object/embed tags
- Data URIs (except images)
- SQL injection patterns

## Integration Points

### Components Using Category Detection:
- `GradedCardIntake.tsx` - Auto-detects from PSA data
- `RawCardIntake.tsx` - Auto-detects from brand input
- `BulkCardIntake.tsx` - Auto-detects from game selection
- `PSABulkImport.tsx` - Pre-import category selection
- `OtherItemsEntry.tsx` - Auto-detects from description
- `TCGPlayerBulkImport.tsx` - Auto-detects from game data
- `EditIntakeItemDialog.tsx` - Manual category editing

### Database Tables:
- `main_categories` - TCG, Sports, Comics
- `sub_categories` - Pokemon, Magic, Baseball, etc.
- `intake_items` - All items with category references

## Future Enhancements

1. **Machine Learning**: Train model on historical data for better detection
2. **Custom Keywords**: Allow admins to add custom detection keywords
3. **Multi-language Support**: Handle non-English brand names
4. **Confidence Scoring**: Return confidence level with detection
5. **API Monitoring**: Log detection accuracy for continuous improvement

## Security Best Practices

### ✅ DO:
- Always normalize and sanitize input from external APIs
- Use type-safe schemas (Zod) for validation
- Apply character whitelisting for text fields
- Encode URLs before using them
- Log validation failures for monitoring

### ❌ DON'T:
- Trust API data without validation
- Use raw database queries with user input
- Allow unlimited field lengths
- Skip unicode normalization
- Ignore type checking

## Monitoring & Logging

Enable debug logging to track category detection:
```typescript
// In categoryMapping.ts
console.log('[detectMainCategory] Input:', input);
console.log('[detectMainCategory] Detected:', category);
```

Check logs for:
- Invalid input warnings
- Unknown category defaults
- Normalization failures
- API data anomalies
