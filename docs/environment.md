# Environment

YITA Iceberg currently uses two runtime modes:

- `local`: Firebase Emulator Suite and local Next.js.
- `production`: the `yita-iceberg` Firebase/GCP project for real business data.

Local development must use the Firebase Emulator Suite. Never point local clients at production data.

## Files

- `.env.local.example`: emulator-safe local defaults.
- `.env.production.example`: production project shape.
- `.env.example`: full variable reference.

Do not commit real `.env.local`, `.env.production`, service account JSON, private keys, or App Check debug tokens.

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

Production fails closed if `APP_BASE_URL` is missing. Firebase App Hosting uses its managed runtime identity through Application Default Credentials. Explicit service-account credentials remain supported for exceptional non-managed environments, but downloaded keys are not required for App Hosting.

## App Check Rollout

1. Configure the reCAPTCHA Enterprise provider and production site key.
2. Set `NEXT_PUBLIC_ENABLE_APP_CHECK=true` and verify valid tokens in monitoring.
3. Set `ENABLE_APP_CHECK_ENFORCEMENT=true` for callable functions.
4. Confirm `NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN` is empty and review rejected requests.

Emulators always disable callable App Check enforcement.
