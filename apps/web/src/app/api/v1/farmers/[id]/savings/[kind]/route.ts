import { openGoalSchema, openHarvestLockSchema } from "@agrilink/validation";
import { v1 } from "@/server/api/v1";
import { notFound } from "@/server/errors";
import { openGoalSavings, openHarvestLock } from "@/server/savings/service";

/**
 * POST /farmers/{id}/savings/harvest-lock  { productId, pct, pin }
 * POST /farmers/{id}/savings/goals         { productId, goalLabel, goalLe, pct, pin }
 * The farmer's PIN is always required (also when an agent helps).
 */
export const POST = v1<{ id: string; kind: string }>(
  async ({ current, params, body }) => {
    if (params.kind === "harvest-lock")
      return {
        data: await openHarvestLock(
          current.actor,
          params.id,
          openHarvestLockSchema.parse(await body()),
        ),
      };
    if (params.kind === "goals")
      return {
        data: await openGoalSavings(current.actor, params.id, openGoalSchema.parse(await body())),
      };
    throw notFound("Savings type");
  },
  { status: 201 },
);
