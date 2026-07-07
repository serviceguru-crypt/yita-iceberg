import { onSchedule } from "firebase-functions/v2/scheduler";

import { expireStaleOrdersAction } from "./service";

export const expireStaleOrders = onSchedule("every 5 minutes", async () => {
  await expireStaleOrdersAction();
});
