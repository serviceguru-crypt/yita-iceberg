import { z } from "zod";

const productionEnvSchema = z.object({
  APP_ENV: z.literal("production"),
  APP_BASE_URL: z.string().url().refine((value) => value.startsWith("https://"), {
    message: "APP_BASE_URL must use HTTPS.",
  }),
  FIREBASE_PROJECT_ID: z.literal("yita-iceberg"),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.literal("yita-iceberg"),
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: z.string().min(1),
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: z.literal("false"),
  NEXT_PUBLIC_ENABLE_APP_CHECK: z.literal("true"),
  NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN: z.string().max(0).optional().default(""),
  ENABLE_APP_CHECK_ENFORCEMENT: z.literal("true"),
  ENABLE_REPORT_SUMMARY_REBUILD: z.literal("true"),
});

const result = productionEnvSchema.safeParse(process.env);

if (!result.success) {
  console.error("Production configuration is incomplete:");
  for (const issue of result.error.issues) {
    console.error(`- ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

if (result.data.APP_BASE_URL.includes("example.com") || result.data.APP_BASE_URL.includes("YOUR_")) {
  console.error("Production configuration is incomplete: APP_BASE_URL is still a placeholder.");
  process.exit(1);
}

console.log("Production configuration verified for yita-iceberg.");
console.log("Firebase Admin will use the hosting runtime's managed identity unless explicit credentials are supplied.");
