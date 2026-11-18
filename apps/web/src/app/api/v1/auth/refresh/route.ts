import { z } from "zod";
import { v1Public } from "@/server/api/v1";
import { refreshMobileSession } from "@/server/auth/tokens";

/** POST { refreshToken } → new token pair (the old refresh token stops working). */
export const POST = v1Public(async ({ body }) => {
  const { refreshToken } = z.object({ refreshToken: z.string().min(10) }).parse(await body());
  return { data: await refreshMobileSession(refreshToken) };
});
