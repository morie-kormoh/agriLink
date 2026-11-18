import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma, prisma } from "@agripay/db";
import type { Actor } from "@agripay/validation/permissions";
import { registerFarmer } from "@/server/farmers/service";
import {
  addRecord,
  closeSeason,
  deleteRecord,
  getSeasonOverview,
  listRecords,
  summarise,
  updateRecord,
} from "@/server/records/service";
import { recordPurchase } from "@/server/trade/purchases";
import { setPrice } from "@/server/trade/settings";
import { smsOutbox } from "@/server/sms";
import {
  type Ref,
  addMember,
  ensureReference,
  farmerInput,
  makeOrgWithMember,
  resetDb,
} from "./helpers";

let ref: Ref;
beforeAll(async () => {
  ref = await ensureReference();
});
beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const SEASON = "2026-DRY";
const inSeason = new Date("2026-11-10T10:00:00Z");

async function setup() {
  const { org, actor: admin } = await makeOrgWithMember("COOPERATIVE", "COOP_ADMIN");
  const { actor: agent } = await addMember(org.id, "AGENT");
  const reg = await registerFarmer(agent, farmerInput(ref));
  const f = await prisma.farmer.findUniqueOrThrow({ where: { id: reg.farmer.id } });
  const farmerActor: Actor = { userId: f.userId!, role: "FARMER", orgId: null, farmerId: f.id };
  return { org, admin, agent, farmer: f, farmerActor };
}

describe("summarise (pure)", () => {
  it("totals costs, sales, harvest and verified share", () => {
    const D = (v: string) => new Prisma.Decimal(v);
    const t = summarise(SEASON, [
      {
        type: "INPUT_PURCHASE",
        amountLe: D("1000"),
        quantity: null,
        unit: null,
        verification: "SELF_REPORTED",
      },
      {
        type: "LABOUR",
        amountLe: D("800"),
        quantity: null,
        unit: null,
        verification: "AGENT_CONFIRMED",
      },
      {
        type: "HARVEST",
        amountLe: null,
        quantity: D("1200"),
        unit: "kg",
        verification: "SELF_REPORTED",
      },
      {
        type: "SALE",
        amountLe: D("8000"),
        quantity: D("1000"),
        unit: "kg",
        verification: "SYSTEM_VERIFIED",
      },
    ]);
    expect(t).toMatchObject({
      totalCostLe: "1800.00",
      totalSalesLe: "8000.00",
      netLe: "6200.00",
      harvestKg: "1200.00",
      recordCount: 4,
    });
    expect(t.verifiedShare).toBeCloseTo(81.63, 1);
  });
  it("uses kilograms sold when no harvest was recorded", () => {
    const t = summarise(SEASON, [
      {
        type: "SALE",
        amountLe: new Prisma.Decimal(10),
        quantity: new Prisma.Decimal(50),
        unit: "kg",
        verification: "SYSTEM_VERIFIED",
      },
    ]);
    expect(t.harvestKg).toBe("50.00");
  });
});

describe("records", () => {
  it("sets verification by who records: farmer = self-reported, agent = confirmed", async () => {
    const { agent, farmer, farmerActor } = await setup();
    const a = await addRecord(farmerActor, farmer.id, {
      type: "INPUT_PURCHASE",
      amountLe: "500",
      description: "NPK",
      occurredAt: inSeason,
    });
    const b = await addRecord(agent, farmer.id, {
      type: "LABOUR",
      amountLe: "300",
      occurredAt: inSeason,
    });
    expect(a).toMatchObject({ verification: "SELF_REPORTED", source: "APP", season: SEASON });
    expect(b).toMatchObject({ verification: "AGENT_CONFIRMED", source: "AGENT" });
  });

  it("validates per type", async () => {
    const { farmer, farmerActor } = await setup();
    await expect(addRecord(farmerActor, farmer.id, { type: "LABOUR" })).rejects.toThrow();
    await expect(
      addRecord(farmerActor, farmer.id, { type: "HARVEST", amountLe: "10" }),
    ).rejects.toThrow();
    const h = await addRecord(farmerActor, farmer.id, {
      type: "HARVEST",
      quantity: 900,
      cropId: ref.cropId,
      occurredAt: inSeason,
    });
    expect(h.unit).toBe("kg");
    const cycle = await prisma.cropCycle.findFirstOrThrow({
      where: { plot: { farmerId: farmer.id } },
    });
    expect(cycle.actualYieldKg?.toFixed(0)).toBe("900");
  });

  it("only the creator may edit or delete, within 30 days, and never automatic records", async () => {
    const { org, agent, farmer, farmerActor } = await setup();
    const rec = await addRecord(farmerActor, farmer.id, { type: "TRANSPORT", amountLe: "50" });
    await expect(updateRecord(agent, rec.id, { amountLe: "60" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await updateRecord(farmerActor, rec.id, { amountLe: "60" });
    expect(
      (await prisma.farmRecord.findUniqueOrThrow({ where: { id: rec.id } })).amountLe?.toFixed(2),
    ).toBe("60.00");

    await prisma.farmRecord.update({
      where: { id: rec.id },
      data: { createdAt: new Date(Date.now() - 31 * 24 * 3600 * 1000) },
    });
    await expect(deleteRecord(farmerActor, rec.id)).rejects.toThrow(/30 days/);

    // automatic SALE from a purchase
    const { actor: staff } = await addMember(org.id, "COOP_STAFF");
    const { actor: admin } = await addMember(org.id, "COOP_ADMIN");
    await setPrice(admin, { cropId: ref.cropId, priceLe: "4" });
    const p = await recordPurchase(staff, {
      farmerId: farmer.id,
      cropId: ref.cropId,
      quantity: 100,
    });
    const sale = await prisma.farmRecord.findUniqueOrThrow({
      where: { sourceRef: `purchase:${p.purchase.id}` },
    });
    await expect(deleteRecord(staff, sale.id)).rejects.toThrow(/Automatic/);
  });

  it("scopes access: other co-ops and other farmers can't read", async () => {
    const { farmer } = await setup();
    const other = await makeOrgWithMember("COOPERATIVE", "COOP_ADMIN");
    await expect(listRecords(other.actor, farmer.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const stranger: Actor = { userId: "x", role: "FARMER", orgId: null, farmerId: "someone-else" };
    await expect(listRecords(stranger, farmer.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("season overview combines manual and purchase records; closing the season texts each farmer once", async () => {
    const { admin, farmer, farmerActor } = await setup();
    await addRecord(farmerActor, farmer.id, {
      type: "INPUT_PURCHASE",
      amountLe: "1800",
      occurredAt: inSeason,
    });
    await addRecord(farmerActor, farmer.id, {
      type: "SALE",
      amountLe: "8000",
      quantity: 1000,
      unit: "kg",
      occurredAt: inSeason,
    });
    const o = await getSeasonOverview(farmerActor, farmer.id, SEASON);
    expect(o.totals).toMatchObject({
      totalCostLe: "1800.00",
      totalSalesLe: "8000.00",
      netLe: "6200.00",
    });

    const r1 = await closeSeason(admin, SEASON);
    expect(r1).toMatchObject({ farmers: 1, smsSent: 1 });
    const r2 = await closeSeason(admin, SEASON);
    expect(r2.smsSent).toBe(0);
    const sms = smsOutbox().filter(
      (m) => m.to === farmer.phone && m.body.includes("2026 dry season"),
    );
    expect(sms).toHaveLength(1);
    expect(sms[0]?.body).toContain("Net Le 6,200");
    expect((await getSeasonOverview(farmerActor, farmer.id, SEASON)).closedAt).not.toBeNull();
  });
});
