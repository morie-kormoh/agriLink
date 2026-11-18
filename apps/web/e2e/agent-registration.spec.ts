import { type Page, expect, test } from "@playwright/test";
import { prisma, signIn } from "./helpers";

const AGENT = { phone: "+23276000010", national: "076 000 010" };

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function fillWizard(page: Page, name: string, phone: string) {
  // 1 Person
  await page.getByLabel("Full name").fill(name);
  await page.getByText("Female", { exact: true }).click();
  await page.getByLabel(/Date of birth/).fill("1996-03-21");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  // 2 Location
  await page.getByRole("combobox", { name: "District" }).click();
  await page.getByRole("option", { name: /Bombali/ }).click();
  await page.getByRole("combobox", { name: "Chiefdom" }).click();
  await page.getByRole("option", { name: "Gbanti" }).click();
  await page.getByLabel("Community / village").fill("Kagbo");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  // 3 Phone & wallet
  await page.getByLabel("Phone number").fill(phone);
  await page.getByText("Orange Money", { exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  // 4 Farm
  await page.getByRole("combobox", { name: "Main crop" }).click();
  await page.getByRole("option", { name: "Rice" }).click();
  await page.getByLabel("Farm size (acres)").fill("2.5");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  // 5 Consent
  await page.getByRole("checkbox", { name: "The farmer agrees to be registered" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  // 6 Review
  await expect(page.getByText(name)).toBeVisible();
}

test("agent signs in and registers a farmer online", async ({ page }) => {
  await signIn(page, AGENT.phone, AGENT.national);
  await page.waitForURL("**/agent");
  await expect(page.getByRole("heading", { name: /Dashboard/ })).toBeVisible();

  await page.goto("/agent/farmers/new");
  const name = `E2E Online ${Date.now().toString().slice(-5)}`;
  await fillWizard(page, name, `079${Date.now().toString().slice(-6)}`);
  await page.getByRole("button", { name: "Save registration" }).click();

  await expect(page.getByText(/AP-BOM-\d{6}/).first()).toBeVisible();
  await page.screenshot({ path: "e2e-results/01-registered-online.png", fullPage: true });
  expect(await prisma.farmer.count({ where: { fullName: name } })).toBe(1);
});

test("agent registers a farmer offline and it syncs when back online", async ({
  page,
  context,
}) => {
  await signIn(page, AGENT.phone, AGENT.national);
  await page.waitForURL("**/agent");
  await page.goto("/agent/farmers/new");
  await page.getByLabel("Full name").waitFor();

  await context.setOffline(true);
  const name = `E2E Offline ${Date.now().toString().slice(-5)}`;
  await fillWizard(page, name, `078${Date.now().toString().slice(-6)}`);
  await page.getByRole("button", { name: "Save registration" }).click();
  await expect(page.getByText("Saved on this device", { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: "e2e-results/02-saved-offline.png", fullPage: true });
  expect(await prisma.farmer.count({ where: { fullName: name } })).toBe(0);

  await context.setOffline(false);
  await expect
    .poll(() => prisma.farmer.count({ where: { fullName: name } }), { timeout: 20_000 })
    .toBe(1);

  await page.goto("/agent/farmers");
  await expect(page.getByText(name)).toBeVisible();
  await page.screenshot({ path: "e2e-results/03-farmers-list.png", fullPage: true });
});

test("co-op admin sees members and only their own co-op", async ({ page }) => {
  await signIn(page, "+23276000002", "076 000 002");
  await page.waitForURL("**/coop");
  await page.screenshot({ path: "e2e-results/04-coop-dashboard.png", fullPage: true });
  await page.goto("/coop/members?q=AP-BOM-000001");
  await expect(page.getByText("AP-BOM-000001")).toBeVisible();
  await page.goto("/coop/members");
  await expect(page.getByText(/AP-KEN-/)).toHaveCount(0);
  await page.goto("/admin");
  await expect(page).toHaveURL(/select-context\?denied=1/);
});

test("farmer sets a transaction PIN", async ({ page }) => {
  await prisma.user.update({ where: { phone: "+23277100001" }, data: { pinHash: null } });
  await signIn(page, "+23277100001", "077 100 001");
  await page.waitForURL("**/farmer");
  await expect(page.getByText(/AP-BOM-000001/).first()).toBeVisible();
  await page.screenshot({ path: "e2e-results/05-farmer-id.png", fullPage: true });
  await page.goto("/settings/security");
  await page.getByLabel("New PIN (4–5 digits)").fill("4826");
  await page.getByLabel("Confirm new PIN").fill("4826");
  await page.getByRole("button", { name: "Save PIN" }).click();
  await expect(page.getByText("Your PIN has been saved.")).toBeVisible();
  const user = await prisma.user.findUniqueOrThrow({ where: { phone: "+23277100001" } });
  expect(user.pinHash).toMatch(/^\$argon2id\$/);
});
