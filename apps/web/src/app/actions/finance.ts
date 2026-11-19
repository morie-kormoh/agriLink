"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import type {
  CreateGroupInput,
  DealerItemInput,
  DealerProfileInput,
  InstitutionSettingsInput,
  LoanProductInput,
  RequestConsentInput,
  SavingsProductInput,
} from "@agrilink/validation";
import type { Actor } from "@agrilink/validation/permissions";
import { requireActor } from "@/server/auth/actor";
import {
  acceptOffer,
  acceptRestructure,
  applyForLoan,
  approveLoan,
  cancelLoan,
  declineLoan,
  makeOffer,
  markDefault,
  proposeRestructure,
  recordManualRepayment,
} from "@/server/credit/loans";
import { disclosureFor, saveLoanProduct } from "@/server/credit/products";
import { saveDealerItem, saveDealerProfile, setDealerVerified } from "@/server/credit/dealers";
import { lookupVoucher, redeemVoucher, requestRedemptionOtp } from "@/server/credit/vouchers";
import { type ActionResult, toActionError } from "@/server/errors";
import { updateInstitution } from "@/server/finance/common";
import { requestConsent, respondConsent, revokeConsent } from "@/server/passport/consent";
import {
  addGroupMember,
  createGroup,
  recordContribution,
  recordPayout,
  sendGroupStatements,
} from "@/server/savings/groups";
import {
  createSavingsProduct,
  openGoalSavings,
  openHarvestLock,
  previewEarlyWithdrawal,
  reconcileSavings,
  requestEarlyWithdrawal,
  setSavingsProductActive,
  updateAutoSave,
} from "@/server/savings/service";

async function run<T = undefined>(fn: (actor: Actor) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const { actor } = await requireActor();
    const data = await fn(actor);
    revalidatePath("/", "layout");
    return { ok: true, data } as ActionResult<T>;
  } catch (e) {
    return toActionError(e);
  }
}
const done = async () => undefined;

// --- Savings (06) --------------------------------------------------------------
export async function openHarvestLockAction(
  farmerId: string,
  productId: string,
  pct: number,
  pin: string,
) {
  return run((a) => openHarvestLock(a, farmerId, { productId, pct, pin }).then(done));
}
export async function openGoalAction(
  farmerId: string,
  input: { productId: string; goalLabel: string; goalLe: string; pct: number },
  pin: string,
) {
  return run((a) => openGoalSavings(a, farmerId, { ...input, pin }).then(done));
}
export async function updateAutoSaveAction(
  accountId: string,
  change: { pct?: number; paused?: boolean },
  pin: string,
) {
  return run((a) => updateAutoSave(a, accountId, { ...change, pin }).then(done));
}
export async function previewEarlyWithdrawalAction(accountId: string, amountLe: string) {
  return run((a) => previewEarlyWithdrawal(a, accountId, amountLe));
}
export async function earlyWithdrawalAction(accountId: string, amountLe: string, pin: string) {
  return run((a) =>
    requestEarlyWithdrawal(a, accountId, { amountLe, pin }).then((r) => ({
      ref: r.payment.ref,
      netLe: r.netLe,
      feeLe: r.feeLe,
    })),
  );
}
export async function createSavingsProductAction(input: SavingsProductInput) {
  return run((a) => createSavingsProduct(a, input).then(done));
}
export async function toggleSavingsProductAction(id: string, active: boolean) {
  return run((a) => setSavingsProductActive(a, id, active).then(done));
}
export async function reconcileSavingsAction(csv: string) {
  return run((a) => {
    const rows = csv
      .split(/\r?\n/)
      .map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")))
      .filter((c) => c[0] && /^SAV-/i.test(c[0]))
      .map((c) => ({ ref: c[0]!.toUpperCase(), balanceLe: c[1] ?? "0" }));
    return reconcileSavings(a, rows);
  });
}

// --- Groups (06) ---------------------------------------------------------------
export async function createGroupAction(input: CreateGroupInput) {
  return run((a) => createGroup(a, input).then((g) => ({ id: g.id })));
}
export async function addGroupMemberAction(
  groupId: string,
  input: {
    farmerId: string;
    role?: "CHAIR" | "TREASURER" | "SECRETARY" | "MEMBER";
    payoutOrder?: number | null;
    guarantor?: boolean;
  },
) {
  return run((a) => addGroupMember(a, groupId, input).then(done));
}
export async function recordContributionAction(
  groupId: string,
  input: {
    farmerId: string;
    periodNo: number;
    amountLe: string;
    method: "MOBILE_MONEY" | "CASH_RECORDED";
    reference?: string | null;
  },
) {
  return run((a) => recordContribution(a, groupId, input).then(done));
}
export async function recordPayoutAction(groupId: string, periodNo: number) {
  return run((a) => recordPayout(a, groupId, { periodNo, method: "CASH_RECORDED" }).then(done));
}
export async function sendGroupStatementsAction(groupId: string) {
  return run((a) => sendGroupStatements(a, groupId));
}

// --- Passport & consent (07) ---------------------------------------------------
export async function respondConsentAction(id: string, decision: "GRANT" | "DECLINE", pin: string) {
  return run((a) => respondConsent(a, id, { decision, pin }).then(done));
}
export async function revokeConsentAction(id: string, pin: string) {
  return run((a) => revokeConsent(a, id, { pin }).then(done));
}
export async function requestConsentAction(input: RequestConsentInput) {
  return run((a) =>
    requestConsent(a, input).then((r) => ({
      ref: r.request.ref,
      duplicate: r.duplicate,
      agrilinkId: r.farmer.agrilinkId,
    })),
  );
}

// --- Credit (08) ---------------------------------------------------------------
export async function saveLoanProductAction(input: LoanProductInput, id?: string) {
  return run((a) => saveLoanProduct(a, input, id).then((p) => ({ id: p.id })));
}
export async function disclosureAction(productId: string, amountLe: string, locale?: "en" | "kri") {
  // Loan terms in the language the person is using (cookie), unless asked for one.
  const lang = locale ?? ((await getLocale()) === "kri" ? "kri" : "en");
  return run(async () => {
    const d = await disclosureFor(productId, amountLe, lang);
    return { lines: d.lines, feeLe: d.feeLe, totalLe: d.totalLe, dueDate: d.dueDate };
  });
}
export async function applyLoanAction(productId: string, amountLe: string, pin: string) {
  return run((a) => applyForLoan(a, { productId, amountLe, pin }).then((l) => ({ ref: l.ref })));
}
export async function makeOfferAction(farmerId: string, productId: string, amountLe: string) {
  return run((a) => makeOffer(a, { farmerId, productId, amountLe }).then((l) => ({ ref: l.ref })));
}
export async function acceptOfferAction(loanId: string, pin: string) {
  return run((a) => acceptOffer(a, loanId, { pin }).then(done));
}
export async function cancelLoanAction(loanId: string, pin: string) {
  return run((a) => cancelLoan(a, loanId, { pin }).then(done));
}
export async function acceptRestructureAction(loanId: string, pin: string) {
  return run((a) => acceptRestructure(a, loanId, { pin }).then(done));
}
export async function approveLoanAction(loanId: string) {
  return run((a) => approveLoan(a, loanId).then((l) => ({ voucher: l.voucher?.code ?? null })));
}
export async function declineLoanAction(loanId: string, reason: string) {
  return run((a) => declineLoan(a, loanId, { reason }));
}
export async function manualRepaymentAction(loanId: string, amountLe: string, reference: string) {
  return run((a) =>
    recordManualRepayment(a, loanId, { amountLe, reference }).then((r) => ({
      outstandingLe: r.outstandingLe,
    })),
  );
}
export async function proposeRestructureAction(loanId: string, dueDate: string, reason: string) {
  return run((a) => proposeRestructure(a, loanId, { dueDate, reason }));
}
export async function markDefaultAction(loanId: string, reason: string) {
  return run((a) => markDefault(a, loanId, { reason }));
}
export async function updateInstitutionAction(input: InstitutionSettingsInput) {
  return run((a) => updateInstitution(a, input).then(done));
}

// --- Agro-dealers (08) ---------------------------------------------------------
export async function saveDealerProfileAction(input: DealerProfileInput) {
  return run((a) => saveDealerProfile(a, input).then(done));
}
export async function saveDealerItemAction(input: DealerItemInput, id?: string) {
  return run((a) => saveDealerItem(a, input, id).then(done));
}
export async function lookupVoucherAction(code: string) {
  return run((a) =>
    lookupVoucher(a, code).then((v) => ({ ...v, expiresAt: v.expiresAt.toISOString() })),
  );
}
export async function requestRedemptionOtpAction(
  code: string,
  items: { itemId: string; qty: number }[],
) {
  return run((a) => requestRedemptionOtp(a, { code, items }));
}
export async function redeemVoucherAction(
  code: string,
  items: { itemId: string; qty: number }[],
  otp: string,
  clientRef: string,
) {
  return run((a) =>
    redeemVoucher(a, { code, items, otp, clientRef }).then((r) => ({
      ref: r.ref,
      amountLe: r.amountLe.toFixed(2),
    })),
  );
}
export async function setDealerVerifiedAction(dealerId: string, verified: boolean) {
  return run((a) => setDealerVerified(a, dealerId, verified).then(done));
}
