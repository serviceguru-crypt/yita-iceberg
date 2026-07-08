# Create First Super Admin

Use only during initial setup or emergency recovery.

1. Confirm the target Firebase project.
2. Set secure environment variables from `.env.production.example` or `.env.staging.example`.
3. Set:

```bash
BOOTSTRAP_SUPER_ADMIN_EMAIL=
BOOTSTRAP_SUPER_ADMIN_NAME=
BOOTSTRAP_CONFIRM=true
```

4. For production also set:

```bash
BOOTSTRAP_ALLOW_PRODUCTION=true
BOOTSTRAP_PRODUCTION_CONFIRMATION=BOOTSTRAP_SUPER_ADMIN_IN_PRODUCTION
```

5. Run `npm run bootstrap:super-admin`.
6. Set or reset the password through Firebase Console.
7. Confirm the audit log `super_admin.bootstrapped`.

Do not run this from CI.
