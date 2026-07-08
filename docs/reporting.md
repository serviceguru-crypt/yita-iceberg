# Reporting

Phase 8 implements dashboards, reports, analytics views, and CSV exports without starting production deployment, monitoring, backup, App Check enforcement, or CI/CD hardening.

## Architecture

Reports are served by Cloud Functions callables:

```text
getDashboardSummary
getSalesReport
getPaymentReport
getInventoryReport
getStockMovementReport
getReversalReport
getCreditReport
getStaffActivityReport
getLowStockReport
exportReport
rebuildReportSummaries
```

The browser sends role-neutral intent: branch scope, selected branch, date range, page size, cursor, and filters. The callable loads the actor from `users/{uid}`, validates input with Zod, resolves branch access server-side, applies bounded Firestore queries, sanitizes rows, and returns summaries plus paginated rows.

## Permissions

- Order registrar, cashier, and release verifier: limited dashboard/activity views only. They cannot access company financial analytics.
- Branch manager: assigned-branch dashboard and reports for sales, payments, stock, reversals, credit, staff activity, and low-stock.
- Admin and super-admin: selected-branch or all-branch reports, branch comparison, and valuation fields.

All-branch reports are rejected for non-admin users. A UI-selected branch is treated only as a hint.

## Date Ranges And Pagination

Detail reports are limited to 93 days. CSV exports are limited to 31 days. Tables request 50 rows at a time and use opaque cursors returned by the callable. The current implementation uses live bounded reads over indexed ledgers with a maximum of 500 documents per branch per source query.

## Aggregation Strategy

Phase 8 uses live bounded queries for the first reporting layer. The reserved materialized summary collection is:

```text
reportSummaries/dailyBranch_{branchId}_{yyyyMMdd}
reportSummaries/dailyCompany_{yyyyMMdd}
reportSummaries/monthlyBranch_{branchId}_{yyyyMM}
reportSummaries/monthlyCompany_{yyyyMM}
```

Source collections are `orders`, `orders/{orderId}/payments`, `financialTransactions`, `saleReversals`, `stockMovements`, `auditLogs`, and branch inventory subcollections. `rebuildReportSummaries` is a callable preview/manual rebuild surface for future materialized summaries; scheduled generation is deferred.

## Export

CSV export uses `exportReport`. The callable enforces the same branch, role, filter, and date limits as the screen report, then returns:

```text
fileName
contentType
content
rowCount
generatedAt
```

The client downloads the CSV locally. Phase 8 does not create public Storage files. `reportExports` metadata and `report-exports/**` Storage paths are denied to clients.

## Sensitive Fields

Report callables never return raw QR tokens, session data, internal Storage paths, or unrestricted audit payloads. Inventory valuation fields are returned only for admin/super-admin users. Payment proof is reduced to status text.

## Low-Stock Logic

Low stock uses available quantity:

```text
availableQty = onHandQty - reservedQty
lowStock = availableQty <= reorderLevel
```

This keeps reserved-but-not-yet-released orders visible in reorder decisions.

## Manual Emulator Testing

1. Run `npm run dev:emulators`.
2. Run `npm run dev`.
3. Sign in as a branch manager and open `/dashboard`.
4. Open each `/reports/*` page with the assigned branch selected.
5. Confirm CSV export downloads and does not expose proof paths or valuation fields for non-admin roles.
6. Sign in as admin and compare selected-branch versus all-branch scope.

## Known Limitations

- Charts are not included yet; views use real summary cards and tables.
- Report summaries are reserved but not scheduled/materialized yet.
- CSV is the only export format in Phase 8.
- External payment-processor refund status is not available; reversal refunds are internal records.
