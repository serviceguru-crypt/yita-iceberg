# CI/CD

GitHub Actions workflows are provided under `.github/workflows/`.

## CI

`ci.yml` runs:

```bash
npm ci
npm --prefix functions ci
npm run typecheck
npm run lint
npm run build
npm run functions:typecheck
npm run functions:lint
npm run functions:build
npm run rules:test
npm run functions:test
git diff --check
```

## Production

`deploy-production.yml` is manual only and uses the GitHub `production` environment for approval. It deploys a supplied release ref to `yita-iceberg` after all checks pass, verifies backup and monitoring controls, and can run an authenticated smoke test when explicitly requested. It does not bootstrap users or run destructive scripts.

## Required Secrets

- `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY`
- `SMOKE_TEST_EMAIL` and `SMOKE_TEST_PASSWORD` when live smoke checks are enabled

The workflow keeps public Firebase web identifiers and the Workload Identity resource names in version control. Authentication still uses GitHub OIDC and does not store a Google service-account key.

Do not commit service account JSON.
