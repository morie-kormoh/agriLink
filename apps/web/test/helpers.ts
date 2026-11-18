import { type Role, prisma } from "@agripay/db";
import type { RegisterFarmerData } from "@agripay/validation";
import { registerFarmerSchema } from "@agripay/validation";
import type { Actor } from "@agripay/validation/permissions";
import { clearSmsOutbox } from "@/server/sms";
import { resetMemoryRateLimits } from "@/server/rate-limit";

/** Wipe transactional tables (reference data is re-created by `ensureReference`). */
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "AuditLog", "LedgerEntry", "LedgerAccount", "ProviderInstruction", "PaymentSplit", "Payment",
      "ProviderCallback", "ReconciliationRun", "SplitRule", "FarmRecord", "SeasonSummary", "Purchase", "PurchaseBatch",
      "PriceList", "CollectionPoint", "Cooperative", "Buyer", "RefreshToken",
      "VoucherRedemption", "InputVoucher", "DealerItem", "AgroDealer", "LoanRepayment", "Loan", "LoanProduct",
      "PassportAccessLog", "ConsentRequest", "CreditScore",
      "GroupPayout", "GroupContribution", "SavingsGroupMember", "SavingsGroup", "SavingsTransaction", "SavingsAccount",
      "SavingsProduct", "FinancialInstitution",
      "CropCycle", "FarmPlot", "Wallet", "Farmer", "Invitation", "OtpCode",
      "Session", "Membership", "Organization", "User", "IdSequence"
    RESTART IDENTITY CASCADE
  `);
  clearSmsOutbox();
  resetMemoryRateLimits();
}

export interface Ref {
  districtId: string;
  chiefdomId: string;
  chiefdom2Id: string;
  otherDistrictChiefdomId: string;
  cropId: string;
}

export async function ensureReference(): Promise<Ref> {
  const region = await prisma.region.upsert({
    where: { name: "Northern Province" },
    update: {},
    create: { name: "Northern Province" },
  });
  const bom = await prisma.district.upsert({
    where: { code: "BOM" },
    update: {},
    create: { code: "BOM", name: "Bombali", regionId: region.id },
  });
  const ken = await prisma.district.upsert({
    where: { code: "KEN" },
    update: {},
    create: { code: "KEN", name: "Kenema", regionId: region.id },
  });
  const c1 = await prisma.chiefdom.upsert({
    where: { districtId_name: { districtId: bom.id, name: "Gbanti" } },
    update: {},
    create: { districtId: bom.id, name: "Gbanti" },
  });
  const c2 = await prisma.chiefdom.upsert({
    where: { districtId_name: { districtId: bom.id, name: "Biriwa" } },
    update: {},
    create: { districtId: bom.id, name: "Biriwa" },
  });
  const k1 = await prisma.chiefdom.upsert({
    where: { districtId_name: { districtId: ken.id, name: "Nongowa" } },
    update: {},
    create: { districtId: ken.id, name: "Nongowa" },
  });
  const rice = await prisma.crop.upsert({
    where: { code: "RICE" },
    update: {},
    create: { code: "RICE", name: "Rice" },
  });
  return {
    districtId: bom.id,
    chiefdomId: c1.id,
    chiefdom2Id: c2.id,
    otherDistrictChiefdomId: k1.id,
    cropId: rice.id,
  };
}

let phoneCounter = 0;
export function nextPhone(): string {
  phoneCounter++;
  return `+2327799${String(phoneCounter).padStart(4, "0")}`;
}

export async function addMember(orgId: string, role: Role) {
  const user = await prisma.user.create({
    data: { phone: nextPhone(), name: `${role} user ${phoneCounter}` },
  });
  await prisma.membership.create({ data: { userId: user.id, orgId, role } });
  return { user, actor: { userId: user.id, role, orgId } as Actor };
}

export async function makeOrgWithMember(
  type: "COOPERATIVE" | "PLATFORM" | "LENDER" | "BUYER" | "AGRO_DEALER",
  role: Role,
  name = `${type} ${Math.random().toString(36).slice(2, 7)}`,
) {
  const org = await prisma.organization.create({ data: { type, name } });
  const user = await prisma.user.create({ data: { phone: nextPhone(), name: `${role} user` } });
  await prisma.membership.create({ data: { userId: user.id, orgId: org.id, role } });
  const actor: Actor = { userId: user.id, role, orgId: org.id };
  return { org, user, actor };
}

export function farmerInput(
  ref: Ref,
  overrides: Partial<Record<string, unknown>> = {},
): RegisterFarmerData {
  return registerFarmerSchema.parse({
    clientRef: crypto.randomUUID(),
    consentToRegister: true,
    fullName: "Aminata Sesay",
    gender: "FEMALE",
    dateOfBirth: "1992-04-10",
    nin: null,
    hasDisability: false,
    districtId: ref.districtId,
    chiefdomId: ref.chiefdomId,
    community: "Masongbo",
    phone: nextPhone(),
    walletProvider: "ORANGE_MONEY",
    walletMsisdn: null,
    sizeAcres: 2,
    cropId: ref.cropId,
    season: "2027-MAIN",
    ...overrides,
  });
}
