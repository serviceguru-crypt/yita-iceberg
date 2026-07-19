# Monitoring

## Logs

Cloud Functions use structured logging helpers in `functions/src/shared/logging.ts`. Sensitive fields such as tokens, cookies, private keys, QR values, and proof storage paths are redacted.

## Alerts To Configure

- Cloud Functions error count above baseline.
- Scheduled `expireStaleOrders` failure.
- Scheduled `rebuildReportSummariesScheduled` failure.
- Permission-denied spike on callables.
- Failed payment confirmation spike.
- Inventory invariant failures or failed stock mutations.
- High reversal/refund volume.
- Report export volume spike.
- Slow function latency p95.
- Firestore read/write quota and cost threshold.
- Storage growth for payment proofs.

Name production alert policies with a `YITA` prefix. At minimum, configure function error rate, callable latency, Firestore quota, and budget alerts. Verify the deployed policies together with backup schedules:

```bash
FIREBASE_PROJECT_ID=yita-iceberg npm run verify:cloud-ops
```

## Suggested Metrics

- Function execution count, error count, and latency by function.
- Firestore document reads/writes/deletes.
- Storage bytes and object count.
- Auth sign-in failures.
- App Check rejected requests after enforcement.

## Error References

Unhandled callable errors return safe messages with an error reference such as `ERR-20260708-ABC123`. Use Cloud Logging to search that reference.

## Incident Handling

1. Identify affected branch/user/function.
2. Freeze risky operational action if data integrity is in question.
3. Export relevant logs and audit records.
4. Apply rollback or hotfix.
5. Record root cause and follow-up work.
