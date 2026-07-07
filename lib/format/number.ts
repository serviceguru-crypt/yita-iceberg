export function formatNairaFromKobo(value: number | null | undefined) {
  const amount = Number.isInteger(value) ? Number(value) : 0;

  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

export function parseNairaToKobo(value: string) {
  const normalized = value.replace(/[^\d.]/g, "");
  if (!normalized) return 0;

  const [naira = "0", fraction = ""] = normalized.split(".");
  const kobo = `${fraction}00`.slice(0, 2);

  return Number.parseInt(naira, 10) * 100 + Number.parseInt(kobo, 10);
}

export function formatQuantity(value: number | null | undefined, unit?: string) {
  const quantity = Number.isInteger(value) ? Number(value) : 0;

  return `${quantity.toLocaleString("en-NG")}${unit ? ` ${unit}` : ""}`;
}
