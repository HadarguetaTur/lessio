# LESSIO — Backup and Restore Validation (Sprint 6)

**Ticket:** DEV-91
**Sprint:** 6 — Production Readiness

---

## Backup Overview

LESSIO uses **Supabase managed backups** for all database data.
No application-level backup mechanism is implemented in Sprint 6.

| Environment | Backup source | Ownership | Retention |
|---|---|---|---|
| Production | Supabase dashboard → Backups (PITR if Pro plan, daily snapshots on Free/Starter) | Operator (owner) | Per Supabase plan — verify in dashboard |
| Staging | Supabase dashboard → Backups | Operator | Per Supabase plan |
| Dev | Not required — dev is disposable | N/A | N/A |

---

## Backup Checklist (Pre-Launch)

Before the first production deploy and before any manual migration:

- [ ] Verify the production Supabase project has backups enabled (Supabase dashboard → Settings → Backups)
- [ ] Confirm the backup retention period meets the pilot's risk tolerance
- [ ] Take a manual snapshot before each production migration: Supabase dashboard → Backups → Create backup
- [ ] Record the snapshot timestamp in your incident notes before applying the migration

---

## Taking a Manual Backup

Supabase does not expose a one-click "create snapshot now" in all plans. For plans that support it:

1. Go to Supabase dashboard → your project → Backups
2. Click **Create backup** (if available for your plan)
3. Note the backup ID and timestamp

If your plan only supports automatic daily snapshots (no on-demand backup):

1. Export critical tables manually using the SQL editor:
   ```sql
   -- Run these before any risky operation and save the output locally
   SELECT * FROM organizations;
   SELECT * FROM profiles;
   SELECT * FROM teachers;
   SELECT * FROM parents;
   SELECT * FROM students;
   SELECT * FROM relationships;
   SELECT * FROM lessons;
   SELECT * FROM charges;
   SELECT * FROM slot_locks;
   SELECT * FROM teacher_availability;
   SELECT * FROM availability_overrides;
   SELECT * FROM cancellation_sessions;
   SELECT * FROM leads;
   ```
2. Save the exported CSVs with the timestamp in the filename

---

## Restore Process

### When to restore

Restore is appropriate when:
- A migration was incorrectly applied and cannot be safely corrected by a forward migration
- A bulk data corruption occurred (e.g., accidental `UPDATE` without a `WHERE` clause)
- Data was deleted and cannot be recovered from application state

Restore is **not** appropriate for:
- A single bad row — use the Data Recovery Playbook instead (`/docs/data-recovery-playbook.md`)
- Schema-only mistakes — write a corrective forward migration instead (`/docs/migration-guide.md`)

### Restore steps (Supabase managed restore)

1. **Stop traffic** — in Vercel, pause or roll back the current production deployment so no new writes occur during restore
2. **Open Supabase dashboard** → your production project → Backups
3. Select the backup taken just before the problem occurred
4. Click **Restore** and confirm the target project
5. Wait for Supabase to complete the restore (may take several minutes depending on DB size)
6. **Do not redeploy application code** until the restore is complete and verified

### Manual restore from CSV exports

If using manual CSV exports (from the manual backup step above):

1. Stop traffic first (roll back the Vercel deployment)
2. For each table, truncate the affected data:
   ```sql
   -- Example: restore the charges table
   TRUNCATE TABLE charges CASCADE;
   ```
3. Import the CSV via Supabase dashboard → Table Editor → Import CSV, or via psql:
   ```bash
   psql <connection_string> -c "\copy charges FROM 'charges_backup_YYYYMMDD.csv' WITH CSV HEADER"
   ```
4. Re-enable constraints and verify row counts match

---

## Post-Restore Validation

After a restore, verify the system is in a correct state before re-enabling traffic.

### Data integrity checks

```sql
-- Verify core entity counts look reasonable
SELECT COUNT(*) AS orgs FROM organizations;
SELECT COUNT(*) AS profiles FROM profiles;
SELECT COUNT(*) AS lessons FROM lessons;
SELECT COUNT(*) AS charges FROM charges;
SELECT COUNT(*) AS slot_locks FROM slot_locks;

-- Verify no orphaned charges (every charge should reference a valid parent and org)
SELECT c.id
FROM charges c
LEFT JOIN parents p ON p.id = c.parent_id
WHERE p.id IS NULL;
-- Expected: 0 rows

-- Verify no orphaned lessons
SELECT l.id
FROM lessons l
LEFT JOIN teachers t ON t.id = l.teacher_id
WHERE t.id IS NULL;
-- Expected: 0 rows

-- Verify slot_locks state is consistent (no locks in 'active' state older than 15 min)
SELECT id, expires_at, status
FROM slot_locks
WHERE status = 'active'
  AND expires_at < now();
-- Expected: 0 rows (expired active locks should not exist; clean up if found)

-- Verify each student has at most one primary parent per org
SELECT student_id, organization_id, COUNT(*) AS primary_count
FROM relationships
WHERE is_primary = true
GROUP BY student_id, organization_id
HAVING COUNT(*) > 1;
-- Expected: 0 rows
```

### Application-level checks

- [ ] Application starts without errors after restore (check Vercel logs)
- [ ] Owner can log in
- [ ] Lesson list loads correctly
- [ ] Charges list loads correctly
- [ ] Booking link generation works (no JWT secret errors)

---

## Incident Record Template

After any restore, record the following in your incident notes:

```
Date/time of incident:
Date/time of restore:
Backup used (ID / timestamp):
Reason for restore:
Tables affected:
Data integrity checks passed (Y/N):
Application smoke tests passed (Y/N):
Operator:
Notes:
```

---

## Operator Responsibilities

For the pilot phase:

- The **owner** is responsible for verifying that production backups are enabled before go-live
- Before each production migration, the owner takes a manual backup or confirms the latest automatic backup timestamp
- The owner is the only person authorized to initiate a production restore
- Any restore must be recorded in the incident log
