import { onSchedule } from "firebase-functions/v2/scheduler";

import { logInfo } from "../shared/logging";
import { expireStaleOrdersAction } from "./service";

export const expireStaleOrders = onSchedule({
  schedule: "every 5 minutes",
  timeZone: "Africa/Lagos",
  timeoutSeconds: 120,
  memory: "512MiB",
}, async () => {
  logInfo("expire_stale_orders.started");
  await expireStaleOrdersAction();
  logInfo("expire_stale_orders.completed");
});
