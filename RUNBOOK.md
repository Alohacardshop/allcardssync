# Production Operations Runbook

## Quick Reference

| Issue | Severity | Response Time | Page |
|-------|----------|---------------|------|
| Database down | P0 | Immediate | Yes |
| Circuit breaker open | P1 | 5 minutes | Yes |
| Queue stuck | P2 | 1 hour | No |
| Slow queries | P3 | Next day | No |

## Common Operations

### 1. Circuit Breaker Recovery

**Symptoms**:
- API requests failing with "Circuit breaker is open"
- `system_logs` showing repeated timeout errors
- External API unavailable

**Diagnosis**:
```sql
-- Check circuit breaker status in logs
SELECT * FROM system_logs 
WHERE message ILIKE '%circuit%breaker%'
ORDER BY created_at DESC 
LIMIT 20;

-- Check recent errors
SELECT level, message, context, created_at 
FROM system_logs 
WHERE level IN ('error', 'warn')
AND created_at > now() - interval '1 hour'
ORDER BY created_at DESC;
```

**Resolution**:
1. **Automatic Recovery**: Circuit breaker will auto-close after timeout (30-60s)
2. **Manual Recovery**: 
   ```bash
   # Redeploy edge function to reset state
   supabase functions deploy catalog-sync-justtcg
   ```
3. **Verify Recovery**:
   ```bash
   # Test the endpoint
   curl https://your-project.functions.supabase.co/catalog-sync-justtcg?game=pokemon
   ```

**Prevention**:
- Monitor external API health
- Implement graceful degradation
- Set up alerts for circuit breaker state

---

### 2. Shopify Sync Queue Stuck

**Symptoms**:
- Items stuck in `queued` status for > 10 minutes
- No progress on queue processing
- `shopify_sync_queue` table growing

**Diagnosis**:
```sql
-- Check queue status
SELECT status, COUNT(*) as count 
FROM shopify_sync_queue 
GROUP BY status;

-- Find stuck items
SELECT id, inventory_item_id, action, status, retry_count, created_at, last_error
FROM shopify_sync_queue 
WHERE status = 'queued' 
AND created_at < now() - interval '10 minutes'
ORDER BY created_at ASC 
LIMIT 20;

-- Check for failed items
SELECT id, inventory_item_id, action, retry_count, last_error
FROM shopify_sync_queue 
WHERE status = 'failed'
ORDER BY created_at DESC 
LIMIT 20;
```

**Resolution**:

**Option A: Clear Failed Items**
```sql
-- Clear only failed items (safe)
SELECT admin_clear_shopify_sync_queue('failed');
```

**Option B: Clear All Queued Items**
```sql
-- Clear all queued items (use with caution)
SELECT admin_clear_shopify_sync_queue('queued');
```

**Option C: Manual Retry**
```sql
-- Reset failed items to retry
UPDATE shopify_sync_queue 
SET status = 'queued', 
    retry_count = 0,
    last_error = NULL
WHERE status = 'failed' 
AND retry_count >= max_retries;
```

**Verification**:
```sql
-- Verify queue is processing
SELECT status, COUNT(*) 
FROM shopify_sync_queue 
GROUP BY status;
```

---

### 3. Batch Processing Failures

**Symptoms**:
- Batch remains in `active` status
- Items not appearing in inventory
- User reports batch "stuck"

**Diagnosis**:
```sql
-- Check batch status
SELECT id, lot_number, status, total_items, total_value, created_by, created_at
FROM intake_lots 
WHERE status = 'active'
ORDER BY created_at DESC 
LIMIT 10;

-- Check batch items
SELECT id, lot_id, quantity, brand_title, subject, price, removed_from_batch_at
FROM intake_items 
WHERE lot_id = '<lot-id>'
ORDER BY created_at DESC;

-- Check for errors
SELECT * FROM system_logs 
WHERE context->>'lot_id' = '<lot-id>'
ORDER BY created_at DESC;
```

**Resolution**:

**Option A: Complete Batch Manually**
```sql
-- Mark batch as completed
UPDATE intake_lots 
SET status = 'completed', 
    completed_at = now()
WHERE id = '<lot-id>';
```

**Option B: Delete Batch** (admin only)
```sql
-- Soft delete batch and items
SELECT admin_delete_batch('<lot-id>', 'Batch stuck - manual deletion');
```

**Verification**:
```sql
-- Verify batch status
SELECT id, lot_number, status, completed_at 
FROM intake_lots 
WHERE id = '<lot-id>';
```

---

### 4. Failed Shopify Sync Recovery

**Symptoms**:
- Inventory item not appearing in Shopify
- Sync queue item marked as `failed`
- Last error indicates API issue

**Diagnosis**:
```sql
-- Find failed sync for specific item
SELECT sq.id, sq.inventory_item_id, sq.action, sq.status, 
       sq.retry_count, sq.last_error, sq.created_at,
       ii.brand_title, ii.subject, ii.sku
FROM shopify_sync_queue sq
JOIN intake_items ii ON ii.id = sq.inventory_item_id
WHERE sq.status = 'failed'
ORDER BY sq.created_at DESC;
```

**Resolution**:

**Option A: Re-queue Single Item**
```sql
-- Re-queue failed item
UPDATE shopify_sync_queue 
SET status = 'queued', 
    retry_count = 0, 
    last_error = NULL
WHERE id = '<queue-item-id>';
```

**Option B: Re-queue All Failed Items**
```sql
-- Re-queue all failed items
UPDATE shopify_sync_queue 
SET status = 'queued', 
    retry_count = 0, 
    last_error = NULL
WHERE status = 'failed';
```

**Option C: Manual Sync via UI**
1. Navigate to Inventory page
2. Find the item by SKU
3. Click "Send to Shopify" button
4. Monitor sync queue for success

---

### 5. Authentication Issues

**Symptoms**:
- User cannot login
- "Invalid authentication token" errors
- User has no access to expected features

**Diagnosis**:
```sql
-- Check user exists
SELECT id, email, created_at, confirmed_at 
FROM auth.users 
WHERE email = '<user-email>';

-- Check user roles
SELECT ur.role, u.email 
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE u.email = '<user-email>';

-- Check user assignments (for non-admins)
SELECT usa.store_key, usa.shopify_location_gid, usa.region_id
FROM user_shopify_assignments usa
JOIN auth.users u ON u.id = usa.user_id
WHERE u.email = '<user-email>';
```

**Resolution**:

**Option A: Grant Admin Role**
```sql
-- Grant admin role (use sparingly)
INSERT INTO user_roles (user_id, role)
SELECT id, 'admin'::app_role 
FROM auth.users 
WHERE email = '<user-email>'
ON CONFLICT (user_id, role) DO NOTHING;
```

**Option B: Grant Staff Role**
```sql
-- Grant staff role
INSERT INTO user_roles (user_id, role)
SELECT id, 'staff'::app_role 
FROM auth.users 
WHERE email = '<user-email>'
ON CONFLICT (user_id, role) DO NOTHING;
```

**Option C: Assign Store/Location**
```sql
-- Assign user to store and location
INSERT INTO user_shopify_assignments (user_id, store_key, shopify_location_gid)
SELECT id, 'your-store-key', 'gid://shopify/Location/123456'
FROM auth.users 
WHERE email = '<user-email>';
```

**Verification**:
```sql
-- Verify role assignment
SELECT ur.role 
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE u.email = '<user-email>';
```

---

### 6. Database Performance Issues

**Symptoms**:
- Slow page loads
- Timeouts on queries
- High database CPU usage

**Diagnosis**:
```sql
-- Find slow queries (requires pg_stat_statements)
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time,
  total_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 1000  -- Queries taking > 1 second
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;

-- Check for missing indexes
SELECT 
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation
FROM pg_stats
WHERE schemaname = 'public'
AND n_distinct > 100
AND correlation < 0.1;
```

**Resolution**:

**Option A: Add Missing Indexes**
```sql
-- Example: Add index on commonly queried columns
CREATE INDEX CONCURRENTLY idx_intake_items_sku 
ON intake_items(sku) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY idx_intake_items_lot_id 
ON intake_items(lot_id) 
WHERE deleted_at IS NULL;
```

**Option B: Vacuum Tables**
```sql
-- Vacuum tables to reclaim space
VACUUM ANALYZE intake_items;
VACUUM ANALYZE shopify_sync_queue;
VACUUM ANALYZE system_logs;
```

**Option C: Archive Old Data**
```sql
-- Archive old system logs
DELETE FROM system_logs 
WHERE created_at < now() - interval '90 days';

-- Archive completed batches
UPDATE intake_lots 
SET status = 'archived'
WHERE status = 'completed' 
AND completed_at < now() - interval '6 months';
```

---

### 7. Credential Rotation

**When to Rotate**:
- Scheduled rotation (every 90 days)
- Suspected credential leak
- Team member departure
- Security audit requirement

**Rotation Steps**:

**1. Shopify Credentials**:
```bash
# In Supabase Dashboard → Project Settings → Secrets
# Update these secrets:
SHOPIFY_STORE_KEY=<new-store-key>
SHOPIFY_ACCESS_TOKEN=<new-token>
SHOPIFY_SHARED_SECRET=<new-secret>

# Verify in system_settings table
```

**2. API Keys**:
```bash
# Update in Supabase Dashboard → Edge Functions → Secrets
JUSTTCG_API_KEY=<new-key>
PSA_PUBLIC_API_TOKEN=<new-token>
```

**3. Database Passwords**:
```bash
# Via Supabase Dashboard → Project Settings → Database
# Reset database password
# Update connection strings in applications
```

**4. Verify Rotation**:
```sql
-- Test connection with new credentials
SELECT current_user, current_database();

-- Check system logs for auth errors
SELECT * FROM system_logs 
WHERE level = 'error' 
AND message ILIKE '%auth%'
AND created_at > now() - interval '1 hour';
```

---

## Emergency Contacts

| Role | Contact | Availability |
|------|---------|--------------|
| Database Admin | admin@example.com | 24/7 |
| DevOps Lead | devops@example.com | Business hours |
| Security Team | security@example.com | 24/7 |

## Escalation Path

1. **Level 1**: Check runbook, attempt resolution
2. **Level 2**: Contact on-call engineer
3. **Level 3**: Escalate to engineering lead
4. **Level 4**: Page database admin (P0 only)

---

## Maintenance Windows

**Recommended Schedule**:
- Database maintenance: Sunday 2-4 AM UTC
- Extension updates: Monthly, during maintenance window
- Index rebuilds: Quarterly, during maintenance window

**Pre-Maintenance Checklist**:
- [ ] Notify users 24 hours in advance
- [ ] Take database snapshot
- [ ] Test rollback procedure
- [ ] Prepare status page update
- [ ] Have rollback plan ready

**Post-Maintenance Verification**:
- [ ] Run smoke tests
- [ ] Check error rates
- [ ] Verify all services operational
- [ ] Update status page
- [ ] Monitor for 1 hour post-maintenance

---

**Last Updated**: 2025-10-27
**Owner**: Engineering Team
**Next Review**: Before production deployment
