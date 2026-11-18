import {
  addGroupMemberSchema,
  recordContributionSchema,
  recordPayoutSchema,
} from "@agripay/validation";
import { v1 } from "@/server/api/v1";
import { notFound } from "@/server/errors";
import {
  addGroupMember,
  recordContribution,
  recordPayout,
  sendGroupStatements,
} from "@/server/savings/groups";

/**
 * POST /groups/{id}/members        { farmerId, role, payoutOrder?, guarantor }
 * POST /groups/{id}/contributions  { farmerId, periodNo, amountLe, method, reference? }  (co-op staff or treasurer)
 * POST /groups/{id}/payouts        { periodNo, method }  (Osusu: pays the member whose turn it is)
 * POST /groups/{id}/statements     SMS every member their total
 */
export const POST = v1<{ id: string; action: string }>(async ({ current, params, body }) => {
  switch (params.action) {
    case "members":
      return {
        data: await addGroupMember(
          current.actor,
          params.id,
          addGroupMemberSchema.parse(await body()),
        ),
      };
    case "contributions":
      return {
        data: await recordContribution(
          current.actor,
          params.id,
          recordContributionSchema.parse(await body()),
        ),
      };
    case "payouts":
      return {
        data: await recordPayout(current.actor, params.id, recordPayoutSchema.parse(await body())),
      };
    case "statements":
      return { data: await sendGroupStatements(current.actor, params.id) };
    default:
      throw notFound("Action");
  }
});
