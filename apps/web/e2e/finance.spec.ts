import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { hash } from "@node-rs/argon2";
import { plantOtp, prisma, signIn as rawSignIn } from "./helpers";

/** Sign in and wait until the app has redirected away from /login (the session cookie is set). */
async function signIn(page: Page, phone: string, national: string) {
  await rawSignIn(page, phone, national);
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/**
 * Modules 06–08 through the real UI (needs `pnpm db:seed` + `pnpm --filter @agripay/web seed:demo`):
 * lender approves the demo farmer's application → dealer redeems part of the voucher with the farmer's SMS code
 * → the farmer sees savings, passport and the voucher balance, and pauses Harvest Lock with their PIN.
 */
const FARMER = { phone: "+23277100001", national: "077 100 001" };
const PIN = "2580";

test.afterAll(() => prisma.$disconnect());

test("input loan: approve → redeem at dealer with farmer code → farmer sees it", async ({
  page,
}) => {
  const farmer = await prisma.farmer.findFirstOrThrow({ where: { phone: FARMER.phone } });
  // Other e2e tests change this farmer's PIN; use a known one for the PIN-confirmed step.
  await prisma.user.update({
    where: { phone: FARMER.phone },
    data: {
      pinHash: await hash(PIN, { memoryCost: 19_456, timeCost: 2, parallelism: 1 }),
      pinFailedCount: 0,
      pinLockedUntil: null,
    },
  });
  let loan = await prisma.loan.findFirst({
    where: { farmerId: farmer.id, status: { in: ["APPLIED", "DISBURSED", "REPAYING"] } },
    orderBy: { createdAt: "desc" },
  });
  test.skip(
    !loan,
    "Run `pnpm --filter @agripay/web seed:demo` first (creates the demo loan application).",
  );

  if (loan!.status === "APPLIED") {
    await signIn(page, "+23276000030", "076 000 030");
    await page.goto("/lender/applications");
    const row = page.getByRole("row", { name: new RegExp(loan!.ref) });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Approve" }).click();
    await expect
      .poll(async () => (await prisma.loan.findUniqueOrThrow({ where: { id: loan!.id } })).status)
      .toBe("DISBURSED");
    await page.context().clearCookies();
  }
  loan = await prisma.loan.findUniqueOrThrow({ where: { id: loan!.id } });
  const voucher = await prisma.inputVoucher.findUniqueOrThrow({ where: { loanId: loan.id } });
  const before = voucher.remainingLe;
  test.skip(before.lt(350), "Voucher already used up by an earlier run.");

  // Dealer counter: code → items → farmer's SMS code → done.
  await signIn(page, "+23276000040", "076 000 040");
  await page.goto("/dealer/redeem");
  await page.getByLabel("Voucher code").fill(voucher.code.toLowerCase());
  await page.getByRole("button", { name: "Check code" }).click();
  await expect(page.getByText("Aminata S.")).toBeVisible();
  const npk = page.locator("div.flex.items-center.justify-between", { hasText: "NPK 15-15-15" });
  await npk.getByRole("button", { name: "+" }).click();
  await page.getByRole("button", { name: "Send confirmation code to farmer" }).click();
  await expect(page.getByText("3 · Code the farmer received")).toBeVisible();
  const otp = await plantOtp(FARMER.phone, "VOUCHER_REDEEM");
  for (const [i, d] of [...otp].entries()) await page.getByLabel(`Digit ${i + 1}`).fill(d);
  await page.getByRole("button", { name: "Confirm redemption" }).click();
  await expect(page.getByText(/Redeemed Le 350/)).toBeVisible();
  const after = await prisma.inputVoucher.findUniqueOrThrow({ where: { id: voucher.id } });
  expect(after.remainingLe.toFixed(2)).toBe(before.minus(350).toFixed(2));
  await page.context().clearCookies();

  // Farmer: loans, passport, savings (+ a PIN-confirmed change).
  await signIn(page, FARMER.phone, FARMER.national);
  await page.goto("/farmer/loans");
  await expect(page.getByText(/Left on voucher/)).toBeVisible();
  await page.goto("/farmer/passport");
  await expect(page.getByText("What makes up your score")).toBeVisible();
  await expect(page.getByText(/never used in your score/)).toBeVisible();
  await page.goto("/farmer/savings");
  await expect(page.getByText("Harvest Lock").first()).toBeVisible();
  const pause = page.getByRole("button", { name: /Pause saving|Resume saving/ }).first();
  const wasPaused = (await pause.textContent())?.includes("Resume");
  await pause.click();
  await page.getByLabel("Your PIN").fill(PIN);
  await page.getByRole("button", { name: "Confirm with PIN" }).click();
  await expect(
    page.getByRole("button", { name: wasPaused ? /Pause saving/ : /Resume saving/ }).first(),
  ).toBeVisible();
});

test("lender cannot open a passport without consent", async ({ page }) => {
  const other = await prisma.farmer.findFirstOrThrow({ where: { agripayId: "AP-KEN-000001" } });
  await signIn(page, "+23276000031", "076 000 031");
  const res = await page.goto(`/lender/farmers/${other.id}`);
  expect(page.url()).toContain(`/lender/farmers/${other.id}`);
  expect(res?.status()).toBe(404);
  await expect(page.getByText("What makes up your score")).toHaveCount(0);
});
