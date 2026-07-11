# Environment

YITA Iceberg uses three isolated environments:

- `local`: Firebase Emulator Suite and local Next.js.
- `staging`: separate Firebase/GCP project for release validation.
- `production`: separate Firebase/GCP project for real business data.

Never point staging or local clients at production data.

## Files

- `.env.local.example`: emulator-safe local defaults.
- `.env.staging.example`: staging project shape.
- `.env.production.example`: production project shape.
- `.env.example`: full variable reference.

Do not commit real `.env.local`, `.env.staging`, `.env.production`, service account JSON, private keys, or App Check debug tokens.

## Public Browser Variables

```text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY
NEXT_PUBLIC_DEFAULT_FUNCTION_REGION
NEXT_PUBLIC_USE_FIREBASE_EMULATORS
NEXT_PUBLIC_ENABLE_APP_CHECK
NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN
```

Only use debug tokens locally or in controlled test devices.

## Server Variables

```text
APP_ENV
APP_BASE_URL
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
FIREBASE_SERVICE_ACCOUNT_JSON
FIREBASE_SERVICE_ACCOUNT_FILE
FIREBASE_STORAGE_BUCKET
SESSION_COOKIE_NAME
SESSION_COOKIE_MAX_AGE_DAYS
DEFAULT_FUNCTION_REGION
ENABLE_APP_CHECK_ENFORCEMENT
ENABLE_REPORT_SUMMARY_REBUILD
MAX_REPORT_EXPORT_DAYS
MAX_DETAIL_REPORT_DAYS
```

Production fails closed if `APP_BASE_URL` or Firebase Admin credentials are missing in server contexts.
For local development against a real Firebase project, prefer `FIREBASE_SERVICE_ACCOUNT_FILE`
pointing to a JSON key stored outside the repository, for example
`/home/aliyu/.config/yita-iceberg/firebase-admin-key.json`.

## App Check Rollout

1. Phase A: configure App Check providers in Firebase Console and set `NEXT_PUBLIC_ENABLE_APP_CHECK=true`; keep `ENABLE_APP_CHECK_ENFORCEMENT=false`.
2. Phase B: monitor App Check token coverage and callable errors.
3. Phase C: set `ENABLE_APP_CHECK_ENFORCEMENT=true` for client callables.
4. Phase D: review unsupported clients and remove debug tokens.

Emulators always disable callable App Check enforcement.
