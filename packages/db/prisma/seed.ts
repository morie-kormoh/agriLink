/**
 * AgriLink seed.
 *  - Reference data (always): regions, districts, chiefdoms, crops.
 *  - Demo data (skipped in production unless SEED_DEMO=1): platform admin, cooperatives,
 *    partner organisations, staff/agents and 60 demo farmers.
 *
 * Run: pnpm db:seed   (idempotent — safe to run again)
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { createPrismaClient } from "../src/client";
import { nextFarmerId } from "../src/sequence";
import { Prisma } from "../src/generated/prisma/client";
import type { Gender, MobileMoneyProvider, OrgType, Role } from "../src/generated/prisma/enums";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

const prisma = createPrismaClient();

// ---------------------------------------------------------------------------
// Reference data
// NOTE: Chiefdom lists are a starting point for the pilot districts (Bombali, Kenema).
// Verify against the latest Statistics Sierra Leone / NEC boundaries before go-live.
// Other districts get an "Other (not listed)" option until their lists are loaded.
// ---------------------------------------------------------------------------
const REGIONS: Record<string, { code: string; name: string }[]> = {
  "Eastern Province": [
    { code: "KAI", name: "Kailahun" },
    { code: "KEN", name: "Kenema" },
    { code: "KON", name: "Kono" },
  ],
  "Northern Province": [
    { code: "BOM", name: "Bombali" },
    { code: "FAL", name: "Falaba" },
    { code: "KOI", name: "Koinadugu" },
    { code: "TON", name: "Tonkolili" },
  ],
  "North West Province": [
    { code: "KAM", name: "Kambia" },
    { code: "KAR", name: "Karene" },
    { code: "PLK", name: "Port Loko" },
  ],
  "Southern Province": [
    { code: "BOD", name: "Bo" },
    { code: "BON", name: "Bonthe" },
    { code: "MOY", name: "Moyamba" },
    { code: "PUJ", name: "Pujehun" },
  ],
  "Western Area": [
    { code: "WAR", name: "Western Area Rural" },
    { code: "WAU", name: "Western Area Urban" },
  ],
};

const CHIEFDOMS: Record<string, string[]> = {
  BOM: [
    "Biriwa",
    "Bombali Sebora",
    "Bombali Siari",
    "Gbanti",
    "Gbendembu",
    "Libeisaygahun",
    "Magbaimba Ndohahun",
    "Makarie",
    "Mara",
    "Ngowahun",
    "Paki Masabong",
    "Safroko Limba",
    "Makeni City",
  ],
  KEN: [
    "Dama",
    "Dodo",
    "Gaura",
    "Gorama Mende",
    "Kandu Leppiama",
    "Koya",
    "Langrama",
    "Lower Bambara",
    "Malegohun",
    "Niawa",
    "Nomo",
    "Nongowa",
    "Simbaru",
    "Small Bo",
    "Tunkia",
    "Wandor",
    "Kenema City",
  ],
};
const OTHER_CHIEFDOM = "Other (not listed)";

const CROPS = [
  { code: "RICE", name: "Rice" },
  { code: "CASSAVA", name: "Cassava" },
  { code: "COCOA", name: "Cocoa" },
  { code: "COFFEE", name: "Coffee" },
  { code: "OIL_PALM", name: "Oil palm" },
  { code: "GROUNDNUT", name: "Groundnut" },
  { code: "MAIZE", name: "Maize" },
  { code: "VEGETABLES", name: "Vegetables" },
  { code: "PEPPER", name: "Pepper" },
  { code: "SWEET_POTATO", name: "Sweet potato" },
];

async function seedReferenceData() {
  for (const [regionName, districts] of Object.entries(REGIONS)) {
    const region = await prisma.region.upsert({
      where: { name: regionName },
      update: {},
      create: { name: regionName },
    });
    for (const d of districts) {
      const district = await prisma.district.upsert({
        where: { code: d.code },
        update: { name: d.name, regionId: region.id },
        create: { code: d.code, name: d.name, regionId: region.id },
      });
      const names = [...(CHIEFDOMS[d.code] ?? []), OTHER_CHIEFDOM];
      for (const name of names) {
        await prisma.chiefdom.upsert({
          where: { districtId_name: { districtId: district.id, name } },
          update: {},
          create: { districtId: district.id, name },
        });
      }
    }
  }
  for (const c of CROPS) {
    await prisma.crop.upsert({
      where: { code: c.code },
      update: { name: c.name },
      create: c,
    });
  }
  console.info(
    `Reference data: ${await prisma.district.count()} districts, ${await prisma.chiefdom.count()} chiefdoms, ${await prisma.crop.count()} crops`,
  );
}

// ---------------------------------------------------------------------------
// Demo data
// Phone numbers below are fictional demo numbers (+232 76 000 0xx / +232 77 10x xxx).
// ---------------------------------------------------------------------------
async function ensureUser(phone: string, name: string) {
  return prisma.user.upsert({
    where: { phone },
    update: {},
    create: { phone, name, phoneVerified: true },
  });
}

async function ensureOrg(type: OrgType, name: string, districtCode?: string) {
  const existing = await prisma.organization.findFirst({ where: { type, name } });
  if (existing) return existing;
  const district = districtCode
    ? await prisma.district.findUniqueOrThrow({ where: { code: districtCode } })
    : null;
  return prisma.organization.create({
    data: { type, name, districtId: district?.id ?? null },
  });
}

async function ensureMember(userId: string, orgId: string, role: Role) {
  await prisma.membership.upsert({
    where: { userId_orgId_role: { userId, orgId, role } },
    update: { active: true },
    create: { userId, orgId, role },
  });
}

const FEMALE_FIRST = [
  "Aminata",
  "Fatmata",
  "Mariama",
  "Isatu",
  "Kadiatu",
  "Hawa",
  "Adama",
  "Mabinty",
  "Zainab",
  "Jeneba",
  "Kumba",
  "Musu",
  "Salamatu",
  "Yeabu",
  "Ramatu",
  "Christiana",
];
const MALE_FIRST = [
  "Mohamed",
  "Ibrahim",
  "Abdul",
  "Alusine",
  "Sorie",
  "Foday",
  "Sahr",
  "Momoh",
  "Lansana",
  "Osman",
  "Joseph",
  "Santigie",
  "Bockarie",
  "Abu",
  "Tamba",
  "Alhaji",
];
const SURNAMES = [
  "Kamara",
  "Sesay",
  "Koroma",
  "Conteh",
  "Bangura",
  "Turay",
  "Mansaray",
  "Kanu",
  "Jalloh",
  "Fofanah",
  "Kargbo",
  "Bah",
  "Lahai",
  "Massaquoi",
  "Musa",
  "Swaray",
];
const PROVIDERS: MobileMoneyProvider[] = ["ORANGE_MONEY", "AFRIMONEY", "QMONEY"];

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length] as T;
}

async function seedDemoFarmers(opts: {
  coopId: string;
  districtCode: string;
  agentUserId: string;
  cropCodes: string[];
  count: number;
  phoneOffset: number;
}) {
  const district = await prisma.district.findUniqueOrThrow({
    where: { code: opts.districtCode },
    include: { chiefdoms: { where: { name: { not: OTHER_CHIEFDOM } } } },
  });
  const crops = await prisma.crop.findMany({ where: { code: { in: opts.cropCodes } } });
  const year = new Date().getFullYear();

  for (let i = 0; i < opts.count; i++) {
    const n = opts.phoneOffset + i;
    const phone = `+2327710${String(n).padStart(4, "0")}`;
    if (await prisma.farmer.findFirst({ where: { phone } })) continue;

    const female = i % 5 !== 1 && i % 5 !== 3; // ~60% women
    const gender: Gender = female ? "FEMALE" : "MALE";
    const first = female ? pick(FEMALE_FIRST, i) : pick(MALE_FIRST, i);
    const fullName = `${first} ${pick(SURNAMES, i * 7 + n)}`;
    const chiefdom = pick(district.chiefdoms, i);
    const crop = pick(crops, i);
    const age = 19 + ((i * 7) % 45); // spread of youth & adults
    const dob = new Date(Date.UTC(year - age, (i * 3) % 12, 1 + (i % 27)));

    await prisma.$transaction(async (tx) => {
      const agrilinkId = await nextFarmerId(tx, district.code);
      const user = await tx.user.create({
        data: { phone, name: fullName, phoneVerified: true },
      });
      await tx.farmer.create({
        data: {
          agrilinkId,
          userId: user.id,
          phone,
          fullName,
          gender,
          dateOfBirth: dob,
          hasDisability: i % 17 === 0,
          householdSize: 3 + (i % 6),
          districtId: district.id,
          chiefdomId: chiefdom.id,
          community: `${chiefdom.name} village ${1 + (i % 4)}`,
          cooperativeId: opts.coopId,
          registeredById: opts.agentUserId,
          registeredVia: "AGENT_APP",
          kycTier: i % 4 === 0 ? 2 : 1,
          wallets: {
            create: {
              provider: pick(PROVIDERS, i),
              msisdn: phone,
              isPrimary: true,
              verified: i % 4 === 0,
              accountName: i % 4 === 0 ? fullName : null,
            },
          },
          plots: {
            create: {
              name: "Main farm",
              sizeAcres: new Prisma.Decimal((1 + (i % 5) * 0.5).toFixed(2)),
              tenure: pick(["FAMILY", "OWNED", "RENTED", "COMMUNITY"] as const, i),
              cropCycles: {
                create: {
                  cropId: crop.id,
                  season: `${year}-MAIN`,
                },
              },
            },
          },
        },
      });
    });
  }
}

/** Modules 06–08: the demo bank is lender and savings custodian; one verified agro-dealer with a catalogue. */
async function seedFinance(lenderId: string, dealerOrgId: string) {
  await prisma.financialInstitution.upsert({
    where: { orgId: lenderId },
    update: {},
    create: {
      orgId: lenderId,
      licenceNo: "BSL/CB/0000 (demo)",
      fundingProvider: "ORANGE_MONEY",
      fundingAccount: "+23276900001",
      collectionAccount: "+23276900002",
      savingsAccount: "+23276900003",
      approvalThresholdLe: 2500,
    },
  });
  const product = async (
    name: string,
    data: Omit<Prisma.SavingsProductUncheckedCreateInput, "name" | "custodianOrgId">,
  ) =>
    (await prisma.savingsProduct.findFirst({ where: { name, custodianOrgId: lenderId } })) ??
    prisma.savingsProduct.create({ data: { name, custodianOrgId: lenderId, ...data } });
  await product("Harvest Lock", {
    type: "HARVEST_LOCK",
    defaultPct: 15,
    minPct: 5,
    maxPct: 40,
    releaseRule: "SEASON_START",
    releaseMonthDay: "04-01",
    earlyWithdrawalAllowed: true,
    earlyWithdrawalFeePct: 2,
    interestNote: "No interest in the demo. A real custodian discloses its rate here.",
  });
  await product("Savings goal", {
    type: "GOAL",
    defaultPct: 10,
    minPct: 5,
    maxPct: 30,
    releaseRule: "GOAL_REACHED",
    earlyWithdrawalAllowed: true,
    earlyWithdrawalFeePct: 2,
  });

  const bom = await prisma.district.findUniqueOrThrow({ where: { code: "BOM" } });
  const shop = await prisma.agroDealer.upsert({
    where: { orgId: dealerOrgId },
    update: {},
    create: {
      orgId: dealerOrgId,
      districtId: bom.id,
      payoutMsisdn: "+23276555100",
      payoutProvider: "ORANGE_MONEY",
      verified: true,
      verifiedAt: new Date(),
    },
  });
  const items: [string, string, string, number][] = [
    ["NPK 15-15-15 (50 kg)", "FERTILISER", "bag", 350],
    ["Urea (50 kg)", "FERTILISER", "bag", 320],
    ["NERICA rice seed (10 kg)", "SEED", "bag", 120],
    ["Groundnut seed (5 kg)", "SEED", "bag", 90],
    ["Herbicide (1 L)", "AGROCHEM", "bottle", 75],
    ["Cutlass", "TOOLS", "each", 45],
  ];
  for (const [name, category, unit, price] of items) {
    if (!(await prisma.dealerItem.findFirst({ where: { dealerId: shop.id, name } }))) {
      await prisma.dealerItem.create({
        data: { dealerId: shop.id, name, category, unit, unitPriceLe: price },
      });
    }
  }
  if (!(await prisma.loanProduct.findFirst({ where: { lenderOrgId: lenderId } }))) {
    await prisma.loanProduct.create({
      data: {
        lenderOrgId: lenderId,
        name: "Rice & groundnut input loan",
        description:
          "Seed and fertiliser for the main season, repaid from your harvest sales through AgriLink.",
        purpose: "INPUTS",
        minAmountLe: 300,
        firstCycleMaxLe: 1000,
        maxAmountLe: 3000,
        graduationPct: 50,
        flatFeePct: 8,
        minBand: "FAIR",
        maxDebtToIncomePct: 40,
        maxRepaymentPctPerSale: 50,
        voucherValidDays: 60,
        allowedCategories: ["SEED", "FERTILISER", "AGROCHEM"],
        eligibleDealerIds: [shop.id],
      },
    });
  }
}

async function seedDemoData() {
  const platform = await ensureOrg("PLATFORM", "AgriLink Salone");
  const admin = await ensureUser("+23276000001", "AgriLink Admin");
  await ensureMember(admin.id, platform.id, "SUPER_ADMIN");

  const coopBom = await ensureOrg("COOPERATIVE", "Bombali Rice Farmers Cooperative", "BOM");
  const coopKen = await ensureOrg("COOPERATIVE", "Kenema Cocoa Growers Cooperative", "KEN");

  const coopAdminBom = await ensureUser("+23276000002", "Isatu Kamara");
  await ensureMember(coopAdminBom.id, coopBom.id, "COOP_ADMIN");
  const coopAdminKen = await ensureUser("+23276000003", "Sahr Lebbie");
  await ensureMember(coopAdminKen.id, coopKen.id, "COOP_ADMIN");
  const coopStaffBom = await ensureUser("+23276000004", "Mohamed Turay");
  await ensureMember(coopStaffBom.id, coopBom.id, "COOP_STAFF");

  const agentBom = await ensureUser("+23276000010", "Fatmata Sesay (Agent)");
  await ensureMember(agentBom.id, coopBom.id, "AGENT");
  const agentKen = await ensureUser("+23276000011", "Tamba Fayia (Agent)");
  await ensureMember(agentKen.id, coopKen.id, "AGENT");

  // Partner organisations used by later modules
  const buyer = await ensureOrg("BUYER", "Salone Grains Aggregators Ltd", "BOM");
  await ensureMember((await ensureUser("+23276000020", "Abu Conteh")).id, buyer.id, "BUYER_ADMIN");
  await ensureMember((await ensureUser("+23276000021", "Ramatu Kanu")).id, buyer.id, "BUYER_STAFF");
  const lender = await ensureOrg("LENDER", "Rokel Community Bank (demo)", "BOM");
  await ensureMember(
    (await ensureUser("+23276000030", "Mabinty Kargbo")).id,
    lender.id,
    "LENDER_ADMIN",
  );
  await ensureMember(
    (await ensureUser("+23276000031", "Ibrahim Koroma")).id,
    lender.id,
    "LENDER_OFFICER",
  );
  const dealer = await ensureOrg("AGRO_DEALER", "Makeni Agro Inputs (demo)", "BOM");
  await ensureMember(
    (await ensureUser("+23276000040", "Osman Bangura")).id,
    dealer.id,
    "AGRO_DEALER",
  );
  await seedFinance(lender.id, dealer.id);
  const programme = await ensureOrg("PROGRAMME", "District Agriculture Office (demo)", "BOM");
  await ensureMember(
    (await ensureUser("+23276000050", "Hawa Mansaray")).id,
    programme.id,
    "PROGRAMME_OFFICER",
  );

  await seedDemoFarmers({
    coopId: coopBom.id,
    districtCode: "BOM",
    agentUserId: agentBom.id,
    cropCodes: ["RICE", "GROUNDNUT", "CASSAVA"],
    count: 30,
    phoneOffset: 1,
  });
  await seedDemoFarmers({
    coopId: coopKen.id,
    districtCode: "KEN",
    agentUserId: agentKen.id,
    cropCodes: ["COCOA", "COFFEE", "OIL_PALM"],
    count: 30,
    phoneOffset: 101,
  });

  console.info(
    `Demo data: ${await prisma.organization.count()} orgs, ${await prisma.user.count()} users, ${await prisma.farmer.count()} farmers`,
  );
  console.info("Demo logins (OTP is printed in the web server console in development):");
  console.info(
    "  +23276000001 Super admin · +23276000002 Bombali co-op admin · +23276000010 Bombali agent",
  );
  console.info(
    "  +23276000030 Lender admin · +23276000031 Loan officer · +23276000040 Agro-dealer",
  );
  console.info("  +23277100001 Demo farmer (Aminata)");
}

async function main() {
  await seedReferenceData();
  if (process.env.NODE_ENV !== "production" || process.env.SEED_DEMO === "1") {
    await seedDemoData();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
