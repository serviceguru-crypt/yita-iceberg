# Handle Stale Orders

`expireStaleOrders` runs every 5 minutes.

1. If stale orders remain, confirm Cloud Scheduler and function logs.
2. Check branch `orderExpiryMinutes`.
3. Confirm orders are still `awaiting_payment` and `unpaid`.
4. If the scheduled job failed, rerun after fixing the failure.
5. Verify reserved inventory was released.

Do not manually edit order status or inventory counts in production.
