import "server-only";
import { notFound } from "next/navigation";
import type { Actor } from "@agrilink/validation/permissions";
import { AppError } from "../errors";
import { getFarmer } from "./service";

/** For pages: unknown or out-of-scope farmers both render a 404 (don't leak existence). */
export async function getFarmerOr404(actor: Actor, id: string) {
  try {
    return await getFarmer(actor, id);
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
}
