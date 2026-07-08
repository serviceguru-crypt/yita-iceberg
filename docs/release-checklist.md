# Release Checklist

## Before Staging

- All required checks pass locally and in CI.
- `.env.staging` values are configured in App Hosting/Firebase.
- App Check provider is configured.
- Firestore and Storage rules tests pass.
- Indexes are deployed and built.

## Staging Validation

- App loads.
- Sign-in works.
- Branch manager sees only assigned branches.
- Registrar creates a test order.
- Cashier confirms payment.
- Release verifier completes release.
- Inventory moves correctly.
- Reports reflect the transaction.
- CSV export works.
- Reversal workflow works with safe test data.

## Before Production

- Staging smoke tests passed.
- Backup bucket exists and test export has run.
- Monitoring alerts are configured.
- First super-admin runbook reviewed.
- Rollback plan reviewed.
- Manual production approval obtained.

## After Production

- Confirm App Hosting healthy rollout.
- Confirm functions healthy.
- Confirm no rules/index deploy errors.
- Run smoke test dry-run.
- Monitor errors and permission-denied spikes.
