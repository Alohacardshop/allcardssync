# Production Deployment Checklist

**Project**: Inventory Management System  
**Deployment Date**: _________________  
**Deployed By**: _________________

---

## Pre-Deployment (T-24 hours)

### 1. Code Review & Testing
- [ ] All PRs merged and approved
- [ ] CI/CD pipeline passing (all tests green)
- [ ] Console to logger migration verified (no `console.log` in production)
- [ ] Smoke tests passing locally
- [ ] Performance tests completed
- [ ] Security scan completed (no critical issues)

### 2. Database Preparation
- [ ] Run `supabase db lint` - all warnings addressed
- [ ] Database migrations tested in staging
- [ ] Backup strategy confirmed
- [ ] Rollback plan documented
- [ ] Indexes verified (see `recommended-indexes.sql`)

### 3. Supabase Configuration Review
- [ ] Review edge functions list
- [ ] Verify JWT verification settings
- [ ] Check rate limits and quotas
- [ ] Confirm backup schedule
- [ ] Review resource limits

---

## Deployment Day (T-0)

### Phase 1: Supabase Dashboard Configuration (30 minutes)

#### Step 1.1: Auth Configuration
Navigate to: **Auth → Password Security**

- [ ] Enable "Leaked Password Protection"
  - Toggle: ON
  - Impact: Users cannot set compromised passwords
  - Test: Try to create user with common password

- [ ] Reduce OTP Expiry Time
  - Navigate to: **Auth → Email Settings**
  - Current value: _______ seconds
  - New value: **300** seconds (5 minutes)
  - Impact: Better security, shorter validity window
  - Test: Request password reset, verify expiry

#### Step 1.2: Environment Variables
Navigate to: **Project Settings → Edge Functions → Manage secrets**

**Required**:
```bash
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```
- [ ] Set `ALLOWED_ORIGINS` with production URLs
- [ ] Verify Supabase URL and keys are set
- [ ] Confirm CORS configuration

**Optional** (for full functionality):
```bash
JUSTTCG_API_KEY=<your-key>          # TCG catalog sync
PSA_PUBLIC_API_TOKEN=<your-token>   # PSA certificate lookups
```
- [ ] Set `JUSTTCG_API_KEY` (if using TCG catalog)
- [ ] Set `PSA_PUBLIC_API_TOKEN` (if using PSA lookups)

#### Step 1.3: Extension Migration (OPTIONAL - Requires Maintenance Window)
⚠️ **Only if you have a maintenance window**

Navigate to: **SQL Editor**

- [ ] Review `sql/migrations/move-extensions-to-schema.sql`
- [ ] Schedule maintenance window (1-2 minutes downtime)
- [ ] Execute migration script
- [ ] Verify extensions moved: `SELECT * FROM pg_extension`
- [ ] Test trigram search functionality

**Skip if**: 
- No maintenance window available
- Extensions already in `extensions` schema
- Linter warnings acceptable for now

---

### Phase 2: Deploy Application (45 minutes)

#### Step 2.1: Database Migrations
```bash
# Verify connection
supabase db ping

# Push migrations
supabase db push

# Verify migrations applied
supabase db diff
```
- [ ] All migrations applied successfully
- [ ] No unexpected schema changes
- [ ] RLS policies in place

#### Step 2.2: Deploy Edge Functions
```bash
# Deploy all functions
supabase functions deploy

# Verify deployments
supabase functions list
```
- [ ] All functions deployed successfully
- [ ] JWT verification enabled (except webhooks)
- [ ] Function logs accessible

#### Step 2.3: Deploy Frontend
```bash
# Build production bundle
npm run build

# Verify build output
ls -lh dist/

# Deploy to hosting (Netlify/Vercel/etc)
# Follow your hosting provider's deployment process
```
- [ ] Build completed without errors
- [ ] Bundle size acceptable (< 2MB recommended)
- [ ] Deployed to production URL
- [ ] DNS configured correctly

---

### Phase 3: Post-Deployment Verification (30 minutes)

#### Step 3.1: Smoke Tests

**Authentication**:
- [ ] Can create new user account
- [ ] Can login with email/password
- [ ] Can logout
- [ ] Session persists on page reload
- [ ] Password reset flow works
- [ ] OTP expires after 5 minutes

**Authorization**:
- [ ] Admin users can access admin panel
- [ ] Non-admin users blocked from admin functions
- [ ] Store/location assignments enforced
- [ ] Client role checks match server policies

**Core Functionality**:
- [ ] Can create intake items
- [ ] Can add items to batch
- [ ] Can complete batch
- [ ] Items appear in inventory
- [ ] Can send items to Shopify
- [ ] Can print labels (if configured)

**Admin Functions**:
- [ ] Can view system logs
- [ ] Can manage users and roles
- [ ] Can configure system settings
- [ ] Can view sync queue status

#### Step 3.2: Database Health Check
```sql
-- Run this query in SQL Editor
WITH metrics AS (
  SELECT 
    (SELECT COUNT(*) FROM shopify_sync_queue WHERE status = 'queued') as queue_depth,
    (SELECT COUNT(*) FROM system_logs WHERE level = 'error' AND created_at > now() - interval '5 minutes') as recent_errors,
    (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
    (SELECT COUNT(*) FROM intake_lots WHERE status = 'active') as active_batches
)
SELECT * FROM metrics;
```
- [ ] Queue depth < 100
- [ ] No recent errors
- [ ] Active connections < 70% of max
- [ ] Active batches reasonable for your operation

#### Step 3.3: Edge Function Health
```bash
# Test health monitor
curl https://your-project.functions.supabase.co/health-monitor \
  -H "Authorization: Bearer <your-jwt>"

# Expected: 200 OK with health status
```
- [ ] Health monitor returns 200 OK
- [ ] Circuit breakers in closed state
- [ ] No recent failures

#### Step 3.4: Monitoring Setup
- [ ] System logs table populated
- [ ] Logs visible in admin dashboard
- [ ] No critical errors in last hour
- [ ] Circuit breaker metrics available

---

## Post-Deployment (T+1 hour)

### Monitor These Metrics

**Application Health** (check every 15 minutes for first hour):
```sql
-- Error rate
SELECT 
  COUNT(*) FILTER (WHERE level = 'error') as errors,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE level = 'error') / COUNT(*), 2) as error_pct
FROM system_logs
WHERE created_at > now() - interval '15 minutes';
```
- [ ] Error rate < 1%
- [ ] No critical errors
- [ ] Circuit breakers closed

**Queue Health**:
```sql
-- Queue status
SELECT status, COUNT(*) FROM shopify_sync_queue GROUP BY status;
```
- [ ] Queue processing normally
- [ ] No items stuck > 10 minutes
- [ ] Failed count reasonable

**User Activity**:
```sql
-- Active sessions
SELECT COUNT(DISTINCT user_id) as active_users
FROM auth.sessions
WHERE expires_at > now();
```
- [ ] Users able to login
- [ ] Sessions not expiring prematurely

---

## Rollback Plan (If Issues Occur)

### Immediate Actions
1. **Notify team**: Alert via Slack/email
2. **Assess severity**: P0 = roll back immediately, P1 = investigate first
3. **Execute rollback**: Follow steps below

### Database Rollback
```bash
# Revert last migration
supabase db reset --version <previous-version>

# Verify rollback
supabase db diff
```

### Edge Function Rollback
```bash
# Redeploy previous version
git checkout <previous-commit>
supabase functions deploy

# Verify deployment
supabase functions list
```

### Frontend Rollback
```bash
# Revert to previous deployment
# (Process depends on hosting provider)
# Netlify: Revert to previous deploy in dashboard
# Vercel: Promote previous deployment
```

### Post-Rollback Verification
- [ ] Application accessible
- [ ] Users can login
- [ ] Core functionality working
- [ ] No data loss
- [ ] Document incident in system_logs

---

## Communication

### Stakeholder Notification

**Before Deployment**:
```
Subject: Production Deployment - [Date] at [Time]

We will be deploying updates to the inventory management system on [Date] at [Time].

Expected downtime: < 5 minutes (for database migration only)

What's new:
- Improved logging and monitoring
- Security enhancements
- Performance optimizations
- Bug fixes

Please save your work before deployment starts.
```

**After Deployment**:
```
Subject: Deployment Complete - Inventory Management System

The production deployment has been completed successfully.

Status: ✅ All systems operational

Key changes:
- Enhanced security (password leak protection enabled)
- Improved error handling
- Better monitoring and alerting

If you encounter any issues, please report to: support@example.com
```

**If Rollback Required**:
```
Subject: [URGENT] Production Rollback in Progress

We encountered issues with the recent deployment and are rolling back to the previous version.

Status: 🔄 Rollback in progress
ETA: [Time]

We will provide updates every 15 minutes until resolved.
```

---

## Sign-Off

### Deployment Team

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Tech Lead | ____________ | ____________ | _____ |
| DevOps | ____________ | ____________ | _____ |
| QA | ____________ | ____________ | _____ |
| Security | ____________ | ____________ | _____ |

### Approval

- [ ] All checklist items completed
- [ ] Smoke tests passing
- [ ] Monitoring configured
- [ ] Team notified of deployment
- [ ] Rollback plan tested and ready
- [ ] On-call engineer identified

**Approved By**: ____________________  
**Date**: ____________________  
**Time**: ____________________

---

## Appendix

### Useful Commands

**Check current deployment**:
```bash
supabase functions list
git log -1 --oneline
```

**View recent logs**:
```bash
supabase functions logs --function=catalog-sync-justtcg --limit=50
```

**Database connection test**:
```bash
supabase db ping
```

**Health check**:
```bash
curl https://your-project.functions.supabase.co/health-monitor
```

---

**Document Version**: 1.0  
**Last Updated**: 2025-10-27  
**Next Review**: After first production deployment
