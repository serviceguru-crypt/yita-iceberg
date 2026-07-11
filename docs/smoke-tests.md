# Smoke Tests

Run:

```bash
npm run smoke:test -- --dry-run
```

Dry run validates configuration and production guard behavior without authenticated writes.

## Staging Authenticated Checks

Seed the minimal staging smoke data after staging deploy and before the full workflow test:

```bash
APP_ENV=staging \
FIREBASE_PROJECT_ID=yita-iceberg-staging \
STAGING_SEED_CONFIRM=true \
STAGING_SEED_DRY_RUN=false \
STAGING_SEED_PASSWORD="<temporary-staging-password>" \
npm run seed:staging-smoke -- --apply
```

The seed script refuses production-looking project IDs and is dry-run by default. It creates deterministic `SMOKE TEST` branch, users, product, inventory, pricing, and customer records.

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
