import { farmerSearchSchema, isYouth, registerFarmerSchema } from "@agripay/validation";
import { page, queryObject, v1 } from "@/server/api/v1";
import { channelForActor, registerFarmer, searchFarmers } from "@/server/farmers/service";

export const dynamic = "force-dynamic";

/** GET ?q&gender&status&cropId&youth&page&pageSize → farmers in the caller's scope. */
export const GET = v1(async ({ current, query }) => {
  const r = await searchFarmers(current.actor, farmerSearchSchema.parse(queryObject(query)));
  return page(
    r.items.map((f) => ({
      id: f.id,
      agripayId: f.agripayId,
      fullName: f.fullName,
      gender: f.gender,
      phone: f.phone,
      community: f.community,
      district: f.district.name,
      chiefdom: f.chiefdom.name,
      cooperative: f.cooperative?.name ?? null,
      mainCrop: f.plots[0]?.cropCycles[0]?.crop.name ?? null,
      kycTier: f.kycTier,
      status: f.status,
      youth: isYouth(f.dateOfBirth),
      hasDisability: f.hasDisability,
      walletVerified: f.wallets[0]?.verified ?? null,
      createdAt: f.createdAt,
    })),
    { page: r.page, pages: r.pages, total: r.total },
  );
});

/** POST RegisterFarmer → 201. Send a `clientRef` UUID so retries never create duplicates. */
export const POST = v1(
  async ({ current, body }) => {
    const input = registerFarmerSchema.parse(await body());
    const r = await registerFarmer(current.actor, input, channelForActor(current.actor));
    return {
      data: {
        created: r.created,
        farmer: r.farmer,
        duplicateOf: r.duplicateOf,
        sharedPhone: r.sharedPhone,
        warnings: r.warnings,
      },
    };
  },
  { status: 201 },
);
