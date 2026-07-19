# Backup And Recovery

## Backup Model

- Daily managed Firestore backup with at least 14 days retention.
- Monthly export retained in a private archive bucket when longer retention is required.
- Payment-proof Storage bucket backed up with bucket versioning or scheduled copy to a private archive bucket.
- Report exports are not public and are not required for long-term recovery unless operational policy says otherwise.

## IAM

Backup buckets must be private IAM-only buckets. Grant write access only to the scheduled backup service account and read/restore access only to break-glass admins.

## Retention

Suggested lifecycle:

- Daily: 30 days.
- Weekly: 12 weeks.
- Monthly: 12 months.

## Configure Managed Backups

```bash
gcloud firestore backups schedules create \
  --project yita-iceberg \
  --database='(default)' \
  --recurrence=daily \
  --retention=14w

FIREBASE_PROJECT_ID=yita-iceberg npm run verify:cloud-ops
```

The production deployment workflow refuses to finish when no Firestore backup schedule or YITA monitoring alert policy is found.
The identity running the check needs permission to list backup schedules and alert policies. Grant the production deploy identity the least-privilege `roles/datastore.backupSchedulesViewer` and `roles/monitoring.alertPolicyViewer` roles alongside its deployment permissions.

## Manual Emergency Export

```bash
gcloud firestore export gs://<private-backup-bucket>/firestore/manual/$(date +%Y%m%d-%H%M%S) \
  --project yita-iceberg
```

## Restore

1. Restore into an isolated recovery project first.
2. Verify users, branches, orders, inventory, payments, reversals, reports, and rules.
3. Confirm the restore point does not overwrite newer legitimate business records.
4. Schedule downtime if production restore is necessary.
5. Use `gcloud firestore import` only after approval from the incident commander.

Do not restore selected operational collections blindly; orders, payments, stock movements, financial transactions, reversals, and inventory are linked.

## Targets

- RPO: 24 hours after scheduled backups are configured.
- RTO: 4-8 hours for a full Firestore restore after backup availability is confirmed.

## Restore Test

Run a quarterly isolated recovery test and record:

- Backup path.
- Restore duration.
- Data verification checklist.
- Any missing IAM or index steps.
