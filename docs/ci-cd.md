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

## Staging

`deploy-staging.yml` runs checks, authenticates with Workload Identity Federation, then deploys rules, indexes, and functions to the staging Firebase project. App Hosting rollout is handled by the Firebase App Hosting backend connected to the staging branch.

## Production

`deploy-production.yml` is manual only and uses the GitHub `production` environment for approval. It deploys a supplied release ref after all checks pass. It does not bootstrap users or run destructive scripts.

## Required Secrets

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`
- `NEXT_PUBLIC_FIREBASE_API_KEY`

Use GitHub environment variables for non-secret project config such as `APP_BASE_URL` and Firebase public IDs.

Do not commit service account JSON.
