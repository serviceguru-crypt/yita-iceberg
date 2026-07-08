# Backup And Recovery

## Backup Model

- Daily Firestore export to `gs://<private-backup-bucket>/firestore/daily/`.
- Weekly retained snapshot.
- Monthly retained snapshot.
- Payment-proof Storage bucket backed up with bucket versioning or scheduled copy to a private archive bucket.
- Report exports are not public and are not required for long-term recovery unless operational policy says otherwise.

## IAM

Backup buckets must be private IAM-only buckets. Grant write access only to the scheduled backup service account and read/restore access only to break-glass admins.

## Retention

Suggested lifecycle:

- Daily: 30 days.
- Weekly: 12 weeks.
- Monthly: 12 months.

## Manual Emergency Export

```bash
gcloud firestore export gs://<private-backup-bucket>/firestore/manual/$(date +%Y%m%d-%H%M%S) \
  --project <production-project-id>
```

## Restore

1. Restore into staging first.
2. Verify users, branches, orders, inventory, payments, reversals, reports, and rules.
3. Confirm the restore point does not overwrite newer legitimate business records.
4. Schedule downtime if production restore is necessary.
5. Use `gcloud firestore import` only after approval from the incident commander.

Do not restore selected operational collections blindly; orders, payments, stock movements, financial transactions, reversals, and inventory are linked.

## Targets

- RPO: 24 hours after scheduled backups are configured.
- RTO: 4-8 hours for a full Firestore restore after backup availability is confirmed.

## Restore Test

Run a quarterly staging restore test and record:

- Backup path.
- Restore duration.
- Data verification checklist.
- Any missing IAM or index steps.
