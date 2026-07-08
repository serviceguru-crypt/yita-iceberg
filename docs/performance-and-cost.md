# Performance And Cost

## Reports

Reports use branch/date filters and pagination. Detail reports default to 50 rows and are capped by `MAX_DETAIL_REPORT_DAYS`. CSV exports are capped by `MAX_REPORT_EXPORT_DAYS`.

## Firestore Indexes

Composite indexes support branch/date report ledgers, operational queues, stock movements, financial transactions, reversals, and report summaries. New indexes may take time to build after deploy.

## Listener Usage

Current UI mostly uses bounded `getDocs` queries rather than long-lived listeners, reducing idle read cost.

## Functions

Callable functions are region-pinned and have max instance limits. Monitor latency and error rates before raising limits.

## Storage

Payment proofs can grow quickly. Enforce upload type/size rules and monitor bucket growth. Report exports are returned directly to the browser in Phase 9 and are not stored publicly.

## Scheduled Jobs

`expireStaleOrders` runs every 5 minutes with bounded batches. `rebuildReportSummariesScheduled` runs daily when enabled and processes active branches with bounded query limits.

## Thresholds To Monitor

- Firestore reads/writes per day.
- Function error rate above 1%.
- Function p95 latency above 2 seconds for callables.
- Storage growth above expected branch volume.
- Report export spikes.
- Reversal/refund spikes.
