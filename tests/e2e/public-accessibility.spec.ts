import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("sign-in is keyboard accessible and has no serious accessibility violations", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeFocused();

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) =>
    violation.impact === "critical" || violation.impact === "serious",
  );
  expect(blocking).toEqual([]);
});

test("public pages fit the viewport without horizontal scrolling", async ({ page }) => {
  for (const path of ["/", "/sign-in"]) {
    await page.goto(path);
    await expect(page.locator("body")).toBeVisible();
    const hasOverflow = await page.locator("html").evaluate(
      (element) => element.scrollWidth > element.clientWidth + 1,
    );
    expect(hasOverflow, `${path} should fit the viewport`).toBe(false);
  }
});

test("security headers protect public responses", async ({ request }) => {
  const response = await request.get("/sign-in");
  expect(response.ok()).toBe(true);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});
