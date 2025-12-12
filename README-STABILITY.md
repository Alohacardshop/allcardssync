# Aloha Card Shop — Stability & Idempotent Shopify Push

This document outlines the stability improvements and idempotent Shopify push system implemented to ensure reliable operations and prevent data duplication.

## 🏗️ Core Stability Features

### ✅ Strict Mode & Suspense
- **StrictMode**: Enabled in `src/main.tsx` for enhanced development debugging
- **Suspense Fallbacks**: Route-level lazy loading with loading spinners prevent blank screens
- **Error Boundaries**: Comprehensive error handling around critical components

### ✅ Global Loading Indicator
- React Query integration shows top progress bar during any API fetching
- Provides visual feedback for all background operations
- Located in `src/components/GlobalLoading.tsx`

### ✅ QZ Tray Printing
- Uses QZ Tray for professional local printing via WebSocket
- Named printer selection (no IP configuration needed)
- Supports both USB and network Zebra printers
- See `README-QzTray.md` for detailed setup

### ✅ Auth Gate Hook
- Extracted Promise.race-based auth timeout logic into reusable `useAuthGate()` hook
- Prevents hanging auth states with configurable timeouts
- Used across all protected routes with proper cleanup

### ✅ Database Safety
- Converted risky `.single()` calls to `.maybeSingle()` to prevent 406 errors
- Graceful handling of missing records in UI
- Improved error messaging for database operations

### ✅ Route-Level Code Splitting
- All major routes lazy-loaded with `React.lazy()`
- Reduces initial bundle size and improves perceived performance
- Suspense boundaries ensure smooth navigation

## 🔄 Idempotent Shopify Push System

The new Shopify sync system guarantees **zero duplicates** through comprehensive safety checks and deterministic operations.

### 🔑 Key Components

#### Deterministic Identifiers (`src/lib/shopify/ids.ts`)
```typescript
// Consistent handle generation
buildHandle({ game: "Pokemon", setCode: "PAL", number: "123", finish: "holo" })
// → "pokemon-pal-123-holo"

// Consistent SKU generation  
buildSku({ setCode: "PAL", number: "123", finish: "holo", grade: "PSA10" })
// → "PAL-123-HOLO-PSA10"
```

#### Existence Checks (`src/lib/shopify/lookup.ts`)
Before every operation, the system checks for existing products by:
1. **Intake ID** (most specific)
2. **External ID** (TCGPlayer, etc.)  
3. **Product Handle** (URL-friendly identifier)
4. **Variant SKU** (product variant level)

#### Safe Upsert Operations (`src/lib/shopify/upsert.ts`)
- Uses Shopify's `productSet` mutation for true upsert behavior
- Automatic retry with exponential backoff (3 attempts)
- Success marking **only after confirmation** from Shopify
- Comprehensive error classification and handling

#### React Integration (`src/hooks/useShopifyUpsert.ts`)
```typescript
const { upsertBatch, retryFailed, processing, errors } = useShopifyUpsert();

// Batch processing with progress tracking
await upsertBatch(items);

// Safe retry of failed items only
await retryFailed(failedItems);
```

### 🛡️ Safety Guarantees

#### Idempotent Operations
- **Multiple retries of same item** → Same result, no duplicates
- **Network timeouts** → Safe to retry immediately  
- **Rate limiting** → Automatic backoff and retry
- **Partial failures** → Only failed items are retried

#### Deterministic Behavior
- Same input always produces same Shopify handle/SKU
- Existence checks prevent creating duplicates
- Metafields track external relationships

#### Error Recovery
- Failed items clearly identified and easily retriable
- Detailed error messages for troubleshooting
- Automatic classification of retry-safe vs permanent errors

### 📊 Retry Panel (`/shopify-sync`)

The new Shopify Sync page provides:
- **Failed Items List**: All items that failed to sync with error details
- **Batch Retry**: Select and retry multiple failed items safely
- **Progress Tracking**: Real-time progress during batch operations  
- **Success Confirmation**: Visual feedback for completed operations

## 🔒 Security Enhancements

### Pre-Commit Secret Scanning
Prevents accidental commits of sensitive data:

```bash
# Setup (run once)
bash scripts/setup-git-hooks.sh

# The hook automatically scans for:
# - JWT tokens (Supabase keys)
# - Shopify access tokens  
# - AWS credentials
# - Generic API keys
# - Supabase URLs outside .env.example
```

### Central Error Handling
- Consistent API error formatting across the application
- Secure error messages (no sensitive data exposure)
- Centralized toast notifications for user feedback

## 🚀 Performance Improvements

### Font Preloading
- Preloads critical font weights to prevent layout shifts
- Reduces cumulative layout shift (CLS) scores
- Better perceived performance on initial load

### Smart Loading States  
- Skeleton loaders during data fetching
- Progressive loading with activity detection
- Auto-refresh pausing when user is active

### Backoff Utilities
- Consistent retry behavior across all API calls
- Prevents thundering herd problems  
- Respects Retry-After headers for rate limiting

## 🎯 Acceptance Criteria Status

✅ **App renders with StrictMode** - No blank screens during navigation  
✅ **Global progress bar** - Visible during React Query operations  
✅ **Single print bridge** - Unified interface documented  
✅ **Auth gate protection** - Routes render only when authenticated  
✅ **Safe database reads** - `.maybeSingle()` used throughout  
✅ **Zero duplicate products** - Comprehensive existence checks  
✅ **Deterministic identifiers** - Consistent handles and SKUs  
✅ **Safe retries** - Idempotent upsert operations  
✅ **Success confirmation** - Database updates only after Shopify confirms  
✅ **Retry UI** - Failed items easily identifiable and retriable  

## 📈 Monitoring & Observability

### System Health Dashboard
- Database connectivity status
- Shopify sync queue health  
- Print service availability
- Error rate monitoring

### Sync Monitoring
- Real-time sync operation tracking
- Failed item identification and classification
- Retry attempt logging and success rates

## 🔧 Developer Experience

### Improved Error Messages
- Clear, actionable error descriptions
- Context-aware retry suggestions  
- Centralized error handling patterns

### Better Debugging
- Comprehensive logging for sync operations
- Detailed request/response tracking
- Error classification for easier troubleshooting

### Safety Nets
- Pre-commit hooks prevent secret leaks
- TypeScript strict mode catches edge cases
- Comprehensive error boundaries prevent crashes

---

## Quick Start

1. **Enable Git Hooks**: `bash scripts/setup-git-hooks.sh`
2. **Access Sync Page**: Navigate to `/shopify-sync`  
3. **Retry Failed Items**: Select items and click "Retry Selected"
4. **Monitor Health**: Check system status on dashboard

The system is now production-ready with comprehensive safety guarantees and zero-duplicate assurance for Shopify operations.