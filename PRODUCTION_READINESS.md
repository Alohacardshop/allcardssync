# Production Readiness Checklist

**Status**: Ready for deployment with manual configuration required

## ✅ Completed Items

### Backend Hardening
- ✅ Console to logger migration (165+ calls migrated)
- ✅ Structured logging with database persistence
- ✅ JWT authentication on all edge functions
- ✅ Circuit breaker pattern implemented
- ✅ HTTP retry logic with exponential backoff
- ✅ Batch operations optimized
- ✅ CI/CD pipeline configured
- ✅ RLS policies on all sensitive tables
- ✅ SECURITY DEFINER functions with search_path protection

### Frontend
- ✅ Error boundaries with recovery
- ✅ Loading states and skeletons
- ✅ Client-side validation
- ✅ Toast notifications for user feedback

## ⚠️ Manual Configuration Required

### Critical (Must Complete Before Production)

#### 1. Supabase Dashboard Configuration
**Auth Settings** → **Password Settings**:
- [ ] Enable "Leaked Password Protection"
  - Path: Auth → Password Security
  - Enable: "Check passwords against leaked password databases"
  
- [ ] Reduce OTP Expiry Time
  - Current: Default (likely 3600 seconds)
  - Recommended: 300 seconds (5 minutes)
  - Path: Auth → Email Settings → OTP Expiry

**Database Extensions**:
- [ ] Move extensions from `public` to `extensions` schema
  - Extensions: `pg_net`, `pg_trgm`
  - See: `sql/migrations/move-extensions-to-schema.sql`
  - ⚠️ This requires a maintenance window

#### 2. Environment Variables
**Required Production Secrets**:
```bash
# In Supabase Dashboard → Project Settings → Edge Functions
ALLOWED_ORIGINS=https://yourdomain.com
```

**Optional Secrets** (for full functionality):
```bash
JUSTTCG_API_KEY=<your-api-key>  # For TCG catalog sync
PSA_PUBLIC_API_TOKEN=<your-token>  # For PSA lookups
```

#### 3. Git Security
⚠️ **CRITICAL**: Remove `.env` file from git history
```bash
# The .env file was accidentally committed
# Run these commands to remove it:
git rm .env
git commit -m "Remove .env file from version control"

# To remove from git history (requires force push):
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all
```

Verify `.gitignore` contains:
```
.env
.env.local
.env.production
```

## 📋 Pre-Deployment Checklist

### Security Validation
- [ ] All edge functions require JWT (except webhooks)
- [ ] RLS policies tested with non-admin users
- [ ] Admin operations require `admin` role
- [ ] Client-side role checks backed by RLS
- [ ] No credentials in git history
- [ ] `.env` file removed from repository

### Database Validation
- [ ] Run Supabase linter: `supabase db lint`
- [ ] Resolve all WARN/ERROR items
- [ ] Verify all functions have `SET search_path`
- [ ] Extensions moved to dedicated schema
- [ ] RLS enabled on all tables with user data

### Application Testing
- [ ] Admin login/logout works
- [ ] Non-admin users cannot access admin functions
- [ ] Batch operations complete successfully
- [ ] Shopify sync queue processes items
- [ ] PSA lookups work (if configured)
- [ ] Label printing works
- [ ] Circuit breaker triggers on API failures
- [ ] Structured logs appear in `system_logs` table

### Performance Testing
- [ ] Batch operations with 100+ items
- [ ] Concurrent users (5+)
- [ ] Database query performance acceptable
- [ ] No N+1 queries in hot paths
- [ ] API response times < 2s for p95

## 🚀 Deployment Steps

### 1. Pre-Deployment
```bash
# Run migrations
supabase db push

# Deploy edge functions
supabase functions deploy --no-verify-jwt

# Verify deployment
npm run test:smoke
```

### 2. Configure Supabase Dashboard
- Enable leaked password protection
- Reduce OTP expiry to 300 seconds
- Set ALLOWED_ORIGINS environment variable
- Add optional API keys (JUSTTCG_API_KEY, PSA_PUBLIC_API_TOKEN)

### 3. Post-Deployment Validation
```bash
# Test authentication
curl -X POST https://your-project.supabase.co/auth/v1/token

# Test edge function
curl https://your-project.functions.supabase.co/health-monitor

# Check system logs
# Via Supabase Dashboard → Database → system_logs table
```

## 📊 Monitoring

### Key Metrics to Track

**Application Health**:
- Circuit breaker status (should be `closed`)
- Queue depth (should be < 100)
- Error rate (should be < 1%)
- API response times (p95 < 2s)

**Database Performance**:
- Query execution time
- Connection pool usage
- Slow query log

**Business Metrics**:
- Batch processing throughput
- Shopify sync success rate
- Failed operations requiring manual intervention

### Recommended Alerts

**Critical (Page Immediately)**:
- Circuit breaker open for > 5 minutes
- Error rate > 10%
- Database connections exhausted
- Edge function deployment failed

**Warning (Review within 1 hour)**:
- Queue depth > 1000
- Circuit breaker opened (recoverable)
- Slow queries detected (> 5s)
- Disk usage > 80%

**Info (Review daily)**:
- Failed Shopify syncs
- PSA lookup failures
- Batch operations > 10 minutes

## 🔍 Troubleshooting

### Circuit Breaker Opened
1. Check `system_logs` for recent errors
2. Verify external API status (JustTCG, PSA, Shopify)
3. Circuit will auto-recover after timeout
4. Manual recovery: Restart edge function

### Queue Stuck
1. Check `shopify_sync_queue` table for status
2. Look for items with `retry_count >= max_retries`
3. Clear failed items: `SELECT admin_clear_shopify_sync_queue('failed')`
4. Re-queue if needed

### Authentication Issues
1. Verify JWT token is valid: `supabase auth verify`
2. Check user_roles table for missing role assignments
3. Verify RLS policies are not blocking access
4. Check `auth.users` table for user status

### Performance Issues
1. Run `EXPLAIN ANALYZE` on slow queries
2. Check for missing indexes
3. Review `system_logs` for query warnings
4. Consider enabling query caching

## 📚 Additional Resources

- [HARDENING.md](./HARDENING.md) - Backend hardening details
- [SECURITY-AUDIT.md](./SECURITY-AUDIT.md) - Security audit results
- [README.md](./README.md) - General project documentation
- [Supabase Database Linter](https://supabase.com/docs/guides/database/database-linter)
- [Supabase Production Checklist](https://supabase.com/docs/guides/platform/going-into-prod)

## 🎯 Success Criteria

### Production Ready When:
- [ ] All critical security items resolved
- [ ] All manual configurations completed
- [ ] Pre-deployment checklist 100% complete
- [ ] Smoke tests passing
- [ ] Monitoring configured
- [ ] Team trained on runbook procedures
- [ ] Rollback plan documented and tested

---

**Last Updated**: 2025-10-27
**Next Review**: Before production deployment
