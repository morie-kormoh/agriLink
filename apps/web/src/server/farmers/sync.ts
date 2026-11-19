import "server-only";
import { registerFarmerSchema } from "@agrilink/validation";
import type { Actor } from "@agrilink/validation/permissions";
import { AppError } from "../errors";
import { channelForActor, registerFarmer } from "./service";

export type SyncRecordResult =
  | {
      clientRef: string;
      status: "created" | "exists";
      farmerId: string;
      agrilinkId: string;
      fullName: string;
      duplicateOf: string | null;
      warnings: string[];
    }
  | {
      clientRef: string | null;
      status: "invalid" | "error";
      error: string;
      fieldErrors?: Record<string, string[]>;
      retryable: boolean;
    };

/**
 * Batch upsert from the offline field app (module 02, step 9).
 * Every record carries a client UUID, so retries never create duplicates.
 * Records are processed independently: one bad record never blocks the batch.
 */
export async function syncFarmers(actor: Actor, records: unknown[]): Promise<SyncRecordResult[]> {
  const results: SyncRecordResult[] = [];
  for (const raw of records) {
    const clientRef =
      raw &&
      typeof raw === "object" &&
      typeof (raw as { clientRef?: unknown }).clientRef === "string"
        ? (raw as { clientRef: string }).clientRef
        : null;
    const parsed = registerFarmerSchema.safeParse(raw);
    if (!parsed.success || !clientRef) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        (fieldErrors[issue.path.join(".") || "_"] ??= []).push(issue.message);
      }
      results.push({
        clientRef,
        status: "invalid",
        error: clientRef ? "Validation failed" : "Missing clientRef",
        fieldErrors,
        retryable: false,
      });
      continue;
    }
    try {
      const r = await registerFarmer(actor, parsed.data, channelForActor(actor));
      results.push({
        clientRef,
        status: r.created ? "created" : "exists",
        farmerId: r.farmer.id,
        agrilinkId: r.farmer.agrilinkId,
        fullName: r.farmer.fullName,
        duplicateOf: r.duplicateOf?.agrilinkId ?? null,
        warnings: r.warnings,
      });
    } catch (e) {
      const known = e instanceof AppError;
      if (!known) console.error("[sync] record failed", clientRef, e);
      results.push({
        clientRef,
        status: known && (e.code === "VALIDATION" || e.code === "FORBIDDEN") ? "invalid" : "error",
        error: known ? e.message : "Server error",
        retryable: !known || e.code === "PROVIDER_ERROR" || e.code === "RATE_LIMITED",
      });
    }
  }
  return results;
}
