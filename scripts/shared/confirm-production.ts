export type ProductionGuardInput = {
  appEnv?: string;
  projectId?: string;
  confirmation?: string;
  requiredConfirmation?: string;
  allowProduction?: boolean;
};

export function isProductionTarget(input: Pick<ProductionGuardInput, "appEnv" | "projectId">) {
  return input.appEnv === "production" || /production|prod/i.test(input.projectId ?? "");
}

export function assertProductionGuard(input: ProductionGuardInput) {
  const production = isProductionTarget(input);
  if (!production) return;
  const required = input.requiredConfirmation ?? "I_UNDERSTAND_THIS_TARGETS_PRODUCTION";
  if (!input.allowProduction || input.confirmation !== required) {
    throw new Error(
      `Refusing to run against production. Set allowProduction and confirmation=${required}.`,
    );
  }
}

export function assertProductionGuardFromEnv(options: {
  confirmationEnv?: string;
  allowEnv?: string;
  requiredConfirmation?: string;
} = {}) {
  assertProductionGuard({
    appEnv: process.env.APP_ENV,
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    confirmation: process.env[options.confirmationEnv ?? "PRODUCTION_CONFIRMATION"],
    allowProduction: process.env[options.allowEnv ?? "ALLOW_PRODUCTION"] === "true",
    requiredConfirmation: options.requiredConfirmation,
  });
}
