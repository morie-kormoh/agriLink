import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { prisma } from "./helpers";

/**
 * The MVP demo build (DEMO_MODE=true MVP_MODE=true): reset → one-click personas → trimmed menus →
 * the farmer applies with PIN → the bank approves → the SMS panel shows the voucher → reset again.
 * Skipped unless the server under test runs with DEMO_MODE=true (set E2E_DEMO=1).
 */
test.skip(process.env.E2E_DEMO !== "1", "Needs a server started with DEMO_MODE=true MVP_MODE=true");
test.afterAll(() => prisma.$disconnect());

async function persona(page: Page, name: RegExp) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("MVP demo story with personas, SMS panel and reset", async ({ page }) => {
  page.on("dialog", (d) => d.accept());

  // Reset from the login page → start of the story.
  await page.goto("/login");
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByText(/Demo reset — Aminata's score \d+ \(fair\)/)).toBeVisible({
    timeout: 60_000,
  });
  const farmer = await prisma.farmer.findFirstOrThrow({ where: { phone: "+23277100001" } });
  expect(await prisma.loan.count({ where: { farmerId: farmer.id } })).toBe(0);

  // Farmer: MVP menu only, then apply for the input loan with PIN.
  await persona(page, /Aminata Sesay/);
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("dialog");
  await expect(menu.getByRole("link", { name: "Loans" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Savings" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Farm records" })).toHaveCount(0); // hidden in MVP mode
  await page.keyboard.press("Escape");
  await page.goto("/farmer/loans");
  await expect(page.getByText(/You can borrow up to Le 1,000/)).toBeVisible();
  await page.getByLabel("Amount (Le)").fill("800");
  await page.getByRole("button", { name: "Read the terms" }).click();
  await expect(page.getByText(/Total to repay: Le 864/)).toBeVisible();
  await page.getByLabel("Your PIN").fill("2580");
  await page.getByRole("button", { name: "Confirm with PIN" }).click();
  await expect(
    page.getByText("Voucher issued").or(page.getByText("Applied")).first(),
  ).toBeVisible();

  // Bank approves in one click.
  await persona(page, /Rokel Community Bank/);
  await page.goto("/lender/applications");
  await page.getByRole("button", { name: "Approve" }).first().click();
  await expect
    .poll(async () => (await prisma.loan.findFirst({ where: { farmerId: farmer.id } }))?.status)
    .toBe("DISBURSED");

  // The audience sees the voucher SMS in the on-screen phone.
  const voucher = await prisma.inputVoucher.findFirstOrThrow({ where: { farmerId: farmer.id } });
  await page.getByRole("button", { name: "Open demo phone (SMS)" }).click();
  await expect(
    page.getByText(`${voucher.code.slice(0, 4)}-${voucher.code.slice(4)}`).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("To Aminata Sesay").first()).toBeVisible();

  // Reset from inside the app: loan gone, back to the start.
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByText(/Demo reset/)).toBeVisible({ timeout: 60_000 });
  expect(await prisma.loan.count({ where: { farmerId: farmer.id } })).toBe(0);
  expect(await prisma.inputVoucher.count({ where: { farmerId: farmer.id } })).toBe(0);
});
