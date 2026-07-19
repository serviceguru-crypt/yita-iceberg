import { execFileSync } from "node:child_process";

function runJson(args: string[]) {
  const output = execFileSync("gcloud", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output) as unknown;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID || "yita-iceberg";

try {
  const schedules = runJson([
    "firestore",
    "backups",
    "schedules",
    "list",
    "--project",
    projectId,
    "--database",
    "(default)",
    "--format=json",
  ]);
  if (!Array.isArray(schedules) || schedules.length === 0) {
    fail("No Firestore backup schedule is configured.");
  }

  const policies = runJson([
    "monitoring",
    "policies",
    "list",
    "--project",
    projectId,
    "--format=json",
  ]);
  const yitaPolicies = Array.isArray(policies)
    ? policies.filter((policy) => {
        const name = (policy as { displayName?: unknown }).displayName;
        return typeof name === "string" && name.toLowerCase().includes("yita");
      })
    : [];
  if (yitaPolicies.length === 0) {
    fail("No YITA monitoring alert policies are configured.");
  }

  console.log(
    `Cloud operations verified for ${projectId}: ${schedules.length} backup schedule(s), ${yitaPolicies.length} YITA alert policy/policies.`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown gcloud error";
  fail(`Unable to verify cloud operations for ${projectId}: ${message}`);
}
