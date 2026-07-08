# Smoke Tests

Run:

```bash
npm run smoke:test -- --dry-run
```

Dry run validates configuration and production guard behavior without authenticated writes.

## Staging Authenticated Checks

Set:

```text
APP_ENV=staging
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

Do not create destructive smoke data in production. Use staging for full order/payment/release/reversal workflow smoke tests.

## Cleanup

Use `SMOKE_TEST_` prefixes for any manual staging test branches, customers, or products. Clean up staging data through controlled admin scripts or Firebase Console after export if needed.
