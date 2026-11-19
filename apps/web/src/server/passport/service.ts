import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@agrilink/db";
import { type ConsentScope, type Db, prisma } from "@agrilink/db";
import { RULES_V1, type ScoreResult, canonicalInputs, score } from "@agrilink/finance";
import { isYouth } from "@agrilink/validation";
import { type Actor, can } from "@agrilink/validation/permissions";
import { audit } from "../audit";
import { forbidden, notFound } from "../errors";
import { queue } from "../queues";
import { computeSeasonTotals } from "../records/service";
import { sendSms } from "../sms";
import { buildScoreInputs } from "./inputs";

export const BAND_LABEL: Record<string, string> = {
  BUILDING: "Building",
  FAIR: "Fair",
  GOOD: "Good",
  STRONG: "Strong",
};
const SCOPE_RANK: Record<ConsentScope, number> = {
  PASSPORT_SUMMARY: 1,
  PASSPORT_DETAILED: 2,
  RECORDS_FULL: 3,
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Compute and store the farmer's score. A new row is written only when the inputs (or model) changed,
 * so history shows real changes. Previous rows are kept (isCurrent=false) for reproducibility.
 */
export async function computeScore(farmerId: string, opts: { notify?: boolean; now?: Date } = {}) {
  const inputs = await buildScoreInputs(prisma, farmerId, opts.now);
  const result: ScoreResult = score(inputs, RULES_V1);
  const inputsHash = createHash("sha256")
    .update(`${result.modelVersion}|${canonicalInputs(inputs)}`)
    .digest("hex");
  const { created, previous, row } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Farmer" WHERE id = ${farmerId} FOR UPDATE`;
    const prev = await tx.creditScore.findFirst({ where: { farmerId, isCurrent: true } });
    if (prev && prev.inputsHash === inputsHash)
      return { created: false, previous: prev, row: prev };
    if (prev) await tx.creditScore.update({ where: { id: prev.id }, data: { isCurrent: false } });
    const r = await tx.creditScore.create({
      data: {
        farmerId,
        score: result.score,
        band: result.band,
        factors: result.factors as unknown as Prisma.InputJsonValue,
        flags: result.flags,
        modelVersion: result.modelVersion,
        inputsHash,
        inputs: inputs as unknown as Prisma.InputJsonValue,
      },
    });
    return { created: true, previous: prev, row: r };
  });
  if (created && previous && previous.band !== row.band && opts.notify !== false) {
    const farmer = await prisma.farmer.findUnique({
      where: { id: farmerId },
      select: { phone: true },
    });
    const tip = result.factors.find((f) => f.tip)?.tip;
    if (farmer) {
      await sendSms(
        farmer.phone,
        `AgriLink: your score is now ${row.score} (${BAND_LABEL[row.band]}).${tip ? ` Open AgriLink to see how to add points.` : ""}`,
        "general",
      );
    }
  }
  return row;
}

/**
 * Ask for a recompute. With SCORE_EXECUTION=queue the worker debounces per farmer (10 minutes);
 * otherwise it runs straight away (development, tests).
 */
export async function scheduleScore(farmerId: string) {
  if (process.env.SCORE_EXECUTION === "queue") {
    await queue("scoring").add(
      "compute",
      { farmerId },
      { jobId: `score:${farmerId}`, delay: 10 * 60_000, removeOnComplete: true, removeOnFail: 100 },
    );
    return;
  }
  await computeScore(farmerId);
}

export async function currentScore(db: Db, farmerId: string) {
  return (
    (await db.creditScore.findFirst({ where: { farmerId, isCurrent: true } })) ??
    computeScore(farmerId, { notify: false })
  );
}

/** Nightly batch: refresh every active farmer (cheap — rows are only written when something changed). */
export async function recomputeAllScores(limit = 5000) {
  const farmers = await prisma.farmer.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
    take: limit,
  });
  let changed = 0;
  for (const f of farmers) {
    const before = await prisma.creditScore.findFirst({
      where: { farmerId: f.id, isCurrent: true },
      select: { id: true },
    });
    const after = await computeScore(f.id);
    if (after.id !== before?.id) changed++;
  }
  return { farmers: farmers.length, changed };
}

// ---------------------------------------------------------------------------
// Farmer's own passport
// ---------------------------------------------------------------------------

export async function getMyPassport(actor: Actor, farmerId = actor.farmerId ?? "") {
  if (!can(actor, "passport.read")) throw forbidden();
  if (actor.role === "FARMER" && actor.farmerId !== farmerId) throw forbidden();
  if (actor.role !== "FARMER" && actor.role !== "SUPER_ADMIN") throw forbidden();
  const farmer = await prisma.farmer.findUnique({ where: { id: farmerId } });
  if (!farmer) throw notFound("Farmer");
  const current = await currentScore(prisma, farmerId);
  const [history, consents, accessLog] = await Promise.all([
    prisma.creditScore.findMany({
      where: { farmerId },
      orderBy: { computedAt: "desc" },
      take: 12,
      select: { score: true, band: true, computedAt: true },
    }),
    prisma.consentRequest.findMany({
      where: { farmerId, status: { in: ["REQUESTED", "GRANTED"] } },
      orderBy: { createdAt: "desc" },
      include: { requesterOrg: { select: { name: true, type: true } } },
    }),
    prisma.passportAccessLog.findMany({
      where: { farmerId },
      orderBy: { viewedAt: "desc" },
      take: 30,
      include: { consent: { include: { requesterOrg: { select: { name: true } } } } },
    }),
  ]);
  const now = new Date();
  return {
    farmer,
    score: current,
    history: history.reverse(),
    pending: consents.filter((c) => c.status === "REQUESTED"),
    granted: consents.filter((c) => c.status === "GRANTED" && (!c.expiresAt || c.expiresAt > now)),
    accessLog,
  };
}

// ---------------------------------------------------------------------------
// Lender view (consent required, every view logged)
// ---------------------------------------------------------------------------

export async function activeConsent(
  db: Db,
  orgId: string,
  farmerId: string,
  scope: ConsentScope = "PASSPORT_SUMMARY",
) {
  const grants = await db.consentRequest.findMany({
    where: { farmerId, requesterOrgId: orgId, status: "GRANTED", expiresAt: { gt: new Date() } },
    orderBy: { grantedAt: "desc" },
  });
  return (
    grants
      .filter((g) => SCOPE_RANK[g.scope] >= SCOPE_RANK[scope])
      .sort((a, b) => SCOPE_RANK[b.scope] - SCOPE_RANK[a.scope])[0] ?? null
  );
}

export async function hasConsent(
  db: Db,
  orgId: string,
  farmerId: string,
  scope: ConsentScope = "PASSPORT_SUMMARY",
) {
  return !!(await activeConsent(db, orgId, farmerId, scope));
}

export async function getPassportForLender(actor: Actor, farmerId: string) {
  if (
    !can(actor, "passport.read") ||
    !actor.orgId ||
    !(actor.role === "LENDER_ADMIN" || actor.role === "LENDER_OFFICER")
  )
    throw forbidden();
  const consent = await activeConsent(prisma, actor.orgId, farmerId);
  // No consent → behave exactly as if the farmer did not exist (no data leak).
  if (!consent || !can(actor, "passport.read", { farmerId, hasConsent: true }))
    throw forbidden("You need the farmer's consent to view this passport.");
  const farmer = await prisma.farmer.findUniqueOrThrow({
    where: { id: farmerId },
    include: { district: { select: { name: true } }, cooperative: { select: { name: true } } },
  });
  const current = await currentScore(prisma, farmerId);
  await prisma.$transaction(async (tx) => {
    await tx.passportAccessLog.create({
      data: {
        consentId: consent.id,
        viewerUserId: actor.userId,
        viewerOrgId: actor.orgId!,
        farmerId,
        scope: consent.scope,
      },
    });
    await audit(tx, {
      actor,
      action: "passport.viewed",
      entity: "Farmer",
      entityId: farmerId,
      after: { consent: consent.ref, scope: consent.scope },
    });
  });
  // Tell the farmer (at most once a day per organisation).
  const dayAgo = new Date(Date.now() - 86_400_000);
  const recentViews = await prisma.passportAccessLog.count({
    where: { farmerId, viewerOrgId: actor.orgId, viewedAt: { gte: dayAgo } },
  });
  if (recentViews === 1) {
    const org = await prisma.organization.findUnique({
      where: { id: actor.orgId },
      select: { name: true },
    });
    await sendSms(
      farmer.phone,
      `AgriLink: ${org?.name ?? "A lender"} viewed your AgriLink passport (you allowed this until ${consent.expiresAt!.toLocaleDateString("en-GB", { timeZone: "UTC" })}). You can stop it anytime in AgriLink.`,
      "general",
    );
  }

  const summary = {
    consent: {
      ref: consent.ref,
      scope: consent.scope,
      expiresAt: consent.expiresAt,
      purpose: consent.purpose,
    },
    farmer: {
      id: farmer.id,
      agrilinkId: farmer.agrilinkId,
      fullName: farmer.fullName,
      district: farmer.district.name,
      cooperative: farmer.cooperative?.name ?? null,
      kycTier: farmer.kycTier,
    },
    score: {
      score: current.score,
      band: current.band,
      factors: current.factors,
      modelVersion: current.modelVersion,
      computedAt: current.computedAt,
      flags: current.flags,
    },
  };
  if (SCOPE_RANK[consent.scope] < SCOPE_RANK.PASSPORT_DETAILED)
    return { ...summary, detail: null, records: null };

  const [sales, savings, loans, seasons] = await Promise.all([
    prisma.purchase.findMany({
      where: { farmerId, status: "PAID" },
      select: { netLe: true, recordedAt: true, crop: { select: { name: true } } },
      orderBy: { recordedAt: "desc" },
      take: 100,
    }),
    prisma.savingsAccount.findMany({
      where: { farmerId },
      select: {
        product: { select: { type: true } },
        balanceLe: true,
        status: true,
        createdAt: true,
      },
    }),
    // Other lenders' names are not shared; only the repayment track record.
    prisma.loan.findMany({
      where: { farmerId, status: { notIn: ["APPLIED", "OFFERED", "DECLINED", "CANCELLED"] } },
      select: {
        status: true,
        approvedLe: true,
        dueDate: true,
        repaidAt: true,
        lateAt: true,
        lenderOrgId: true,
      },
    }),
    prisma.farmRecord.findMany({
      where: { farmerId },
      select: { season: true },
      distinct: ["season"],
      orderBy: { season: "desc" },
      take: 4,
    }),
  ]);
  const seasonTotals = await Promise.all(
    seasons.map((s) => computeSeasonTotals(prisma, farmerId, s.season)),
  );
  const detail = {
    sales: sales.map((s) => ({
      amountLe: s.netLe.toFixed(2),
      date: s.recordedAt,
      crop: s.crop.name,
    })),
    savings: savings.map((s) => ({
      type: s.product.type,
      balanceLe: s.balanceLe.toFixed(2),
      status: s.status,
      since: s.createdAt,
    })),
    loans: loans.map((l) => ({
      status: l.status,
      amountLe: l.approvedLe?.toFixed(2) ?? null,
      dueDate: l.dueDate,
      repaidAt: l.repaidAt,
      wasLate: !!l.lateAt,
      withYou: l.lenderOrgId === actor.orgId,
    })),
    seasons: seasonTotals,
  };
  if (SCOPE_RANK[consent.scope] < SCOPE_RANK.RECORDS_FULL)
    return { ...summary, detail, records: null };
  const records = await prisma.farmRecord.findMany({
    where: { farmerId },
    orderBy: { occurredAt: "desc" },
    take: 200,
  });
  return { ...summary, detail, records };
}

// ---------------------------------------------------------------------------
// Fairness monitoring (module 11): score distribution by gender and youth — aggregates only.
// ---------------------------------------------------------------------------

export async function scoreDistribution(actor: Actor) {
  if (!can(actor, "analytics.read")) throw forbidden();
  const rows = await prisma.creditScore.findMany({
    where: {
      isCurrent: true,
      ...(actor.role === "COOP_ADMIN" ? { farmer: { cooperativeId: actor.orgId } } : {}),
    },
    select: { score: true, band: true, farmer: { select: { gender: true, dateOfBirth: true } } },
  });
  const groups = new Map<string, { n: number; sum: number; bands: Record<string, number> }>();
  const add = (key: string, r: (typeof rows)[number]) => {
    const g = groups.get(key) ?? {
      n: 0,
      sum: 0,
      bands: { BUILDING: 0, FAIR: 0, GOOD: 0, STRONG: 0 },
    };
    g.n++;
    g.sum += r.score;
    g.bands[r.band] = (g.bands[r.band] ?? 0) + 1;
    groups.set(key, g);
  };
  for (const r of rows) {
    add("all", r);
    add(`gender:${r.farmer.gender}`, r);
    add(
      r.farmer.dateOfBirth
        ? isYouth(r.farmer.dateOfBirth)
          ? "age:youth"
          : "age:adult"
        : "age:unknown",
      r,
    );
  }
  // Suppress small groups so individuals cannot be identified.
  return [...groups.entries()].map(([key, g]) =>
    g.n < 5
      ? { key, n: g.n, suppressed: true as const }
      : {
          key,
          n: g.n,
          avgScore: Math.round(g.sum / g.n),
          bands: g.bands,
          suppressed: false as const,
        },
  );
}
