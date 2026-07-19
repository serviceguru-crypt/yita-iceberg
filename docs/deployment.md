# Deployment

## Current Architecture

The safest deployment path for this Next.js app is Firebase App Hosting for the web app plus Firebase deploys for Firestore rules, Storage rules, Firestore indexes, and Cloud Functions.

`apphosting.yaml` defines the App Hosting runtime shape. Classic Firebase Hosting is not configured in `firebase.json`.

## Project Aliases

`.firebaserc` uses the organization's Firebase project:

```json
{
  "default": "yita-iceberg",
  "yita": "yita-iceberg"
}
```

Local development uses emulators with the same project ID so cross-service rules tests share one namespace. Production uses `APP_ENV=production` and the deployed `yita-iceberg` services.

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

## Production Deploy

Production deploys must be manual, from `main` or a release tag, after local emulator tests and a controlled pre-release validation pass.

```bash
npm run verify:production
npm run firebase:use:yita
npm run deploy:rules:yita
npm run deploy:indexes:yita
npm run deploy:functions:yita
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

For authenticated checks, set `SMOKE_TEST_EMAIL` and `SMOKE_TEST_PASSWORD`. The production workflow can run these checks only when its `run_live_smoke` approval input is enabled.

## Avoid Emulator Misconfiguration

Production must have:

```text
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false
NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN=
APP_ENV=production
```

Indexes can take time to build after deploy. Reports that rely on new composite indexes may fail until indexing completes.
