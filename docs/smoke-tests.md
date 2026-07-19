# Smoke Tests

Run:

```bash
npm run smoke:test -- --dry-run
```

Dry run validates configuration and production guard behavior without authenticated writes.

## Authenticated Checks

Use a dedicated active admin smoke-test account. Do not generate disposable production orders or mutate live inventory from automated smoke checks.

Set:

```text
APP_ENV=production
APP_BASE_URL=
FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
SMOKE_TEST_EMAIL=
SMOKE_TEST_PASSWORD=
```

Then run:

```bash
npm run smoke:test
```

The script checks app routes and calls `getDashboardSummary` as the smoke-test user.

## Production Guard

Production smoke checks require:

```text
SMOKE_TEST_ALLOW_PRODUCTION=true
SMOKE_TEST_PRODUCTION_CONFIRMATION=RUN_SMOKE_TESTS_AGAINST_PRODUCTION
```

The automated smoke test is read-only: it checks routes and calls the dashboard summary. Perform order/payment/release/reversal validation with controlled records and explicit business approval.

## Cleanup

Use `SMOKE TEST` labels for any approved manual validation records. Reverse or archive them through normal audited workflows after verification.
