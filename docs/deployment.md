# Deployment

## Current Architecture

The safest deployment path for this Next.js app is Firebase App Hosting for the web app plus Firebase deploys for Firestore rules, Storage rules, Firestore indexes, and Cloud Functions.

`apphosting.yaml` defines the App Hosting runtime shape. Classic Firebase Hosting is not configured in `firebase.json`.

## Project Aliases

`.firebaserc` uses:

```json
{
  "default": "yita-iceberg-dev",
  "staging": "yita-iceberg-staging",
  "production": "yita-iceberg-production"
}
```

Replace placeholder project IDs with real Firebase project IDs before deployment.

## Build

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
```

## Staging Deploy

```bash
npm run firebase:use:staging
npm run deploy:rules:staging
npm run deploy:indexes:staging
npm run deploy:functions:staging
```

Create/connect the App Hosting backend in Firebase Console or Google Cloud, point it at the staging branch, and configure staging environment variables from `.env.staging.example`.

## Production Deploy

Production deploys must be manual, from `main` or a release tag, after staging smoke tests pass.

```bash
npm run firebase:use:production
npm run deploy:rules:production
npm run deploy:indexes:production
npm run deploy:functions:production
```

Promote the verified App Hosting release through the Firebase Console/App Hosting workflow. Do not run super-admin bootstrap from CI.

## Rollback

- App Hosting: roll back to the previous healthy rollout in Firebase Console.
- Functions: redeploy the previous release tag.
- Rules/indexes: redeploy the previous committed `firestore.rules`, `storage.rules`, and `firestore.indexes.json`.
- Data: do not restore backups blindly. Follow `docs/backup-and-recovery.md`.

## Verification

Run:

```bash
npm run smoke:test -- --dry-run
```

For staging authenticated checks, set `SMOKE_TEST_EMAIL` and `SMOKE_TEST_PASSWORD`.

## Avoid Emulator Misconfiguration

Production and staging must have:

```text
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false
NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN=
APP_ENV=staging|production
```

Indexes can take time to build after deploy. Reports that rely on new composite indexes may fail until indexing completes.
