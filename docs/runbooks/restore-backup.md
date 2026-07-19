# Restore Backup

1. Declare incident and appoint one owner.
2. Identify backup path and restore scope.
3. Restore to an isolated recovery project first.
4. Verify users, orders, payments, inventory, reversals, and reports.
5. Confirm no newer production data will be overwritten.
6. Schedule downtime for production restore.
7. Run approved `gcloud firestore import`.
8. Rebuild indexes if required.
9. Run smoke tests.

Never restore linked collections partially unless engineering has mapped every dependency.
