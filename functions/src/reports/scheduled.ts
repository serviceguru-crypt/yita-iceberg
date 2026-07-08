import { onSchedule } from "firebase-functions/v2/scheduler";

import { logInfo } from "../shared/logging";
import { reportSummaryRebuildEnabled } from "../shared/runtime";
import { rebuildYesterdayReportSummariesAction } from "./service";

export const rebuildReportSummariesScheduled = onSchedule(
  {
    schedule: "every day 02:30",
    timeZone: "Africa/Lagos",
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async () => {
    if (!reportSummaryRebuildEnabled()) {
      logInfo("report_summaries.skipped", { reason: "ENABLE_REPORT_SUMMARY_REBUILD is false" });
      return;
    }
    await rebuildYesterdayReportSummariesAction();
  },
);
