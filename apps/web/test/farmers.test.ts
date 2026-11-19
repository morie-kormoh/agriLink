import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { nextFarmerId, prisma } from "@agrilink/db";
import { computeKycTier, namesMatch } from "@/server/farmers/kyc";
import { commitImport, previewImport } from "@/server/farmers/import";
import {
  getFarmer,
  listSuspectedDuplicates,
  registerFarmer,
  resolveDuplicate,
  searchFarmers,
  verifyWallet,
} from "@/server/farmers/service";
import { syncFarmers } from "@/server/farmers/sync";
import { smsOutbox } from "@/server/sms";
import {
  type Ref,
  ensureReference,
  farmerInput,
  makeOrgWithMember,
  nextPhone,
  resetDb,
} from "./helpers";

let ref: Ref;
beforeAll(async () => {
  ref = await ensureReference();
});
beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const search = { page: 1, pageSize: 50 } as const;

describe("AgriLink IDs", () => {
  it("are unique and sequential under concurrency", async () => {
    const ids = await Promise.all(Array.from({ length: 25 }, () => nextFarmerId(prisma, "BOM")));
    expect(new Set(ids).size).toBe(25);
    expect(ids.every((id) => /^AP-BOM-\d{6}$/.test(id))).toBe(true);
    expect([...ids].sort().at(-1)).toBe("AP-BOM-000025");
  });
});

describe("registerFarmer", () => {
  it("creates user, farmer, wallet, plot, crop cycle, audit row and welcome SMS", async () => {
    const { actor, org } = await makeOrgWithMember("COOPERATIVE", "AGENT");
    const input = farmerInput(ref, { latitude: 8.88, longitude: -12.04, gpsAccuracyM: 12 });
    const r = await registerFarmer(actor, input);

    expect(r.created).toBe(true);
    expect(r.farmer.agrilinkId).toMatch(/^AP-BOM-\d{6}$/);
    const f = await prisma.farmer.findUniqueOrThrow({
      where: { id: r.farmer.id },
      include: { wallets: true, plots: { include: { cropCycles: true } }, user: true },
    });
    expect(f.cooperativeId).toBe(org.id);
    expect(f.registeredVia).toBe("AGENT_APP");
    expect(f.user?.phone).toBe(input.phone);
    expect(f.wallets).toHaveLength(1);
    expect(f.wallets[0]).toMatchObject({
      provider: "ORANGE_MONEY",
      msisdn: input.phone,
      isPrimary: true,
    });
    expect(f.plots[0]?.cropCycles[0]?.season).toBe("2027-MAIN");
    // PostGIS trigger populated geom
    const [geo] = await prisma.$queryRaw<
      { x: number; y: number }[]
    >`SELECT ST_X(geom) AS x, ST_Y(geom) AS y FROM "FarmPlot" WHERE "farmerId" = ${f.id}`;
    expect(geo).toEqual({ x: -12.04, y: 8.88 });
    expect(
      await prisma.auditLog.count({ where: { action: "farmer.registered", entityId: f.id } }),
    ).toBe(1);
    expect(
      smsOutbox().some((m) => m.to === input.phone && m.body.includes(r.farmer.agrilinkId)),
    ).toBe(true);
  });

  it("is idempotent on clientRef (offline retries)", async () => {
    const { actor } = await makeOrgWithMember("COOPERATIVE", "AGENT");
    const input = farmerInput(ref);
    const [a, b] = await Promise.all([registerFarmer(actor, input), registerFarmer(actor, input)]);
    expect(a.farmer.id).toBe(b.farmer.id);
    expect(await prisma.farmer.count()).toBe(1);
  });

  it("rejects a chiefdom outside the district and agents registering into another co-op", async () => {
    const { actor } = await makeOrgWithMember("COOPERATIVE", "AGENT");
    await expect(
      registerFarmer(actor, farmerInput(ref, { chiefdomId: ref.otherDistrictChiefdomId })),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const other = await makeOrgWithMember("COOPERATIVE", "COOP_ADMIN");
    await expect(
      registerFarmer(actor, farmerInput(ref, { cooperativeId: other.org.id })),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lenders and buyers cannot register farmers", async () => {
    const { actor } = await makeOrgWithMember("LENDER", "LENDER_OFFICER");
    await expect(registerFarmer(actor, farmerInput(ref))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("co-op attestation gives tier 2; NIN on top gives tier 3", async () => {
    const { actor } = await makeOrgWithMember("COOPERATIVE", "COOP_STAFF");
    const a = await registerFarmer(actor, farmerInput(ref));
    const b = await registerFarmer(
      actor,
      farmerInput(ref, { fullName: "Mohamed Kamara", gender: "MALE", nin: "SL1234567" }),
    );
    expect(a.farmer.kycTier).toBe(2);
    expect(b.farmer.kycTier).toBe(3);
    expect(b.farmer.status).toBe("ACTIVE");
  });
});

describe("duplicate detection", () => {
  it("flags same phone + similar name as a duplicate", async () => {
    const { actor } = await makeOrgWithMember("COOPERATIVE", "AGENT");
    const phone = nextPhone();
    const first = await registerFarmer(
      actor,
      farmerInput(ref, { phone, fullName: "Aminata Sesay" }),
    );
    const second = await registerFarmer(
      actor,
      farmerInput(ref, { phone, fullName: "Aminata Sesay", walletProvider: null }),
    );
    expect(second.farmer.status).toBe("DUPLICATE_SUSPECTED");
    expect(second.duplicateOf?.id).toBe(first.farmer.id);
    expect(second.duplicateOf?.reason).toBe("SAME_PHONE_SIMILAR_NAME");
  });

  it("treats same phone + different name as a shared phone, not a duplicate", async () => {
    const { actor } = await makeOrgWithMember("COOPERATIVE", "AGENT");
    const phone = nextPhone();
    await registerFarmer(actor, farmerInput(ref, { phone, fullName: "Aminata Sesay" }));
    const r = await registerFarmer(
      actor,
      farmerInput(ref, { phone, fullName: "Ibrahim Koroma", gender: "MALE", walletProvider: null }),
    );
    expect(r.farmer.status).toBe("ACTIVE");
    expect(r.sharedPhone).toBe(true);
    expect(r.warnings).toContain("SHARED_PHONE");
    const f = await prisma.farmer.findUniqueOrThrow({ where: { id: r.farmer.id } });
    expect(f.userId).toBeNull(); // no login for the second person on a shared phone
  });

  it("flags a re-used NIN and keeps the NIN off the new record", async () => {
    const { actor } = await makeOrgWithMember("COOPERATIVE", "AGENT");
    await registerFarmer(actor, farmerInput(ref, { nin: "SL0000001" }));
    const r = await registerFarmer(
      actor,
      farmerInput(ref, { nin: "SL0000001", fullName: "Someone Else", gender: "MALE" }),
    );
    expect(r.farmer.status).toBe("DUPLICATE_SUSPECTED");
    expect(r.duplicateOf?.reason).toBe("SAME_NIN");
    expect(r.warnings).toContain("NIN_ALREADY_REGISTERED");
    expect((await prisma.farmer.findUniqueOrThrow({ where: { id: r.farmer.id } })).nin).toBeNull();
  });

  it("flags a near-identical name in the same chiefdom with matching DOB, but not in another chiefdom", async () => {
    const { actor } = await makeOrgWithMember("COOPERATIVE", "AGENT");
    await registerFarmer(actor, farmerInput(ref, { fullName: "Fatmata Bangura" }));
    const same = await registerFarmer(actor, farmerInput(ref, { fullName: "Fatmata Banguraa" }));
    expect(same.farmer.status).toBe("DUPLICATE_SUSPECTED");
    const elsewhere = await registerFarmer(
      actor,
      farmerInput(ref, { fullName: "Fatmata Banguraa", chiefdomId: ref.chiefdom2Id }),
    );
    expect(elsewhere.farmer.status).toBe("ACTIVE");
  });

  it("co-op admin resolves duplicates", async () => {
    const coop = await makeOrgWithMember("COOPERATIVE", "COOP_ADMIN");
    const phone = nextPhone();
    await registerFarmer(coop.actor, farmerInput(ref, { phone }));
    const dup = await registerFarmer(coop.actor, farmerInput(ref, { phone, walletProvider: null }));
    const list = await listSuspectedDuplicates(coop.actor);
    expect(list).toHaveLength(1);
    expect(list[0]?.original?.phone).toBe(phone);
    await resolveDuplicate(coop.actor, dup.farmer.id, "DEACTIVATE");
    expect((await prisma.farmer.findUniqueOrThrow({ where: { id: dup.farmer.id } })).status).toBe(
      "INACTIVE",
    );
    await expect(
      resolveDuplicate(coop.actor, dup.farmer.id, "NOT_DUPLICATE"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("scope", () => {
  it("co-op staff only see their own co-op; agents see their own registrations", async () => {
    const a = await makeOrgWithMember("COOPERATIVE", "COOP_ADMIN");
    const b = await makeOrgWithMember("COOPERATIVE", "COOP_ADMIN");
    const fa = await registerFarmer(a.actor, farmerInput(ref));
    await registerFarmer(b.actor, farmerInput(ref, { fullName: "Other Farmer" }));

    expect((await searchFarmers(a.actor, search)).total).toBe(1);
    await expect(getFarmer(b.actor, fa.farmer.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const lender = await makeOrgWithMember("LENDER", "LENDER_OFFICER");
    await expect(searchFarmers(lender.actor, search)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const platform = await makeOrgWithMember("PLATFORM", "SUPER_ADMIN");
    expect((await searchFarmers(platform.actor, search)).total).toBe(2);
  });

  it("searches by name, AgriLink ID and phone", async () => {
    const { actor } = await makeOrgWithMember("COOPERATIVE", "COOP_ADMIN");
    const r = await registerFarmer(actor, farmerInput(ref, { fullName: "Kadiatu Turay" }));
    expect((await searchFarmers(actor, { ...search, q: "kadiatu" })).total).toBe(1);
    expect(
      (await searchFarmers(actor, { ...search, q: r.farmer.agrilinkId.toLowerCase() })).total,
    ).toBe(1);
    const f = await prisma.farmer.findUniqueOrThrow({ where: { id: r.farmer.id } });
    expect((await searchFarmers(actor, { ...search, q: `0${f.phone.slice(4)}` })).total).toBe(1);
    expect((await searchFarmers(actor, { ...search, q: "nobody" })).total).toBe(0);
  });
});

describe("wallet verification (mock provider)", () => {
  it("marks the wallet verified when names match and raises the KYC tier", async () => {
    const { actor } = await makeOrgWithMember("COOPERATIVE", "AGENT");
    const r = await registerFarmer(actor, farmerInput(ref));
    expect(r.farmer.kycTier).toBe(1);
    const wallet = await prisma.wallet.findFirstOrThrow({ where: { farmerId: r.farmer.id } });
    const v = await verifyWallet(actor, wallet.id);
    expect(v.match).toBe(true);
    expect(v.kycTier).toBe(2);
  });
});

describe("offline sync endpoint logic", () => {
  it("processes each record independently and is idempotent", async () => {
    const { actor } = await makeOrgWithMember("COOPERATIVE", "AGENT");
    const good = { ...farmerInput(ref), dateOfBirth: "1992-04-10" };
    const bad = { clientRef: crypto.randomUUID(), fullName: "X" };
    const noRef = { ...farmerInput(ref), clientRef: undefined, dateOfBirth: "1990-01-01" };

    const first = await syncFarmers(actor, [good, bad, noRef]);
    expect(first.map((r) => r.status)).toEqual(["created", "invalid", "invalid"]);
    const again = await syncFarmers(actor, [good]);
    expect(again[0]?.status).toBe("exists");
    expect(await prisma.farmer.count()).toBe(1);
  });
});

describe("CSV import", () => {
  const row = (o: Record<string, string> = {}) => ({
    full_name: "Hawa Kamara",
    gender: "F",
    phone: "077123987",
    date_of_birth: "1985-02-03",
    nin: "",
    district_code: "BOM",
    chiefdom: "gbanti",
    community: "Kagbo",
    crop_code: "rice",
    farm_size_acres: "1.5",
    wallet_provider: "Afrimoney",
    ...o,
  });

  it("previews without writing, reports row errors, then commits idempotently", async () => {
    const { actor } = await makeOrgWithMember("COOPERATIVE", "COOP_ADMIN");
    const rows = [
      row(),
      row({ phone: "077123987", full_name: "Same Phone" }),
      row({ phone: "088111222", district_code: "XXX" }),
      row({ phone: "099111222", crop_code: "BANANA" }),
    ];
    const preview = await previewImport(actor, rows);
    expect(preview.valid).toHaveLength(1);
    expect(preview.invalid.map((i) => i.row)).toEqual([3, 4, 5]);
    expect(await prisma.farmer.count()).toBe(0);

    const result = await commitImport(actor, rows);
    expect(result).toMatchObject({ created: 1, invalid: 3 });
    const again = await commitImport(actor, rows);
    expect(again).toMatchObject({ created: 0, existing: 1 });
    const f = await prisma.farmer.findFirstOrThrow({ include: { wallets: true } });
    expect(f.registeredVia).toBe("CSV");
    expect(f.wallets[0]?.provider).toBe("AFRIMONEY");
  });

  it("is limited to co-op admins", async () => {
    const { actor } = await makeOrgWithMember("COOPERATIVE", "AGENT");
    await expect(previewImport(actor, [row()])).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("KYC helpers", () => {
  it("computes tiers", () => {
    expect(computeKycTier({ hasVerifiedWallet: false, coopAttested: false, hasNin: true })).toBe(1);
    expect(computeKycTier({ hasVerifiedWallet: true, coopAttested: false, hasNin: false })).toBe(2);
    expect(computeKycTier({ hasVerifiedWallet: false, coopAttested: true, hasNin: true })).toBe(3);
  });
  it("matches wallet names token-wise", () => {
    expect(namesMatch("AMINATA SESAY", "Aminata  Sesay")).toBe(true);
    expect(namesMatch("Aminata Sesay", "Aminata Fatmata Sesay")).toBe(true);
    expect(namesMatch("Aminata Sesay", "Mohamed Sesay")).toBe(false);
  });
});
