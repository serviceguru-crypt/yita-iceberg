# Rotate Secrets

1. Identify the secret and consumers.
2. Create the replacement in Google Secret Manager or deployment environment.
3. Update staging first.
4. Deploy/restart affected service.
5. Verify staging.
6. Update production during a maintenance window.
7. Revoke the old secret.
8. Confirm no secret value was logged or committed.

Rotate App Check debug tokens separately and remove unused debug tokens promptly.
