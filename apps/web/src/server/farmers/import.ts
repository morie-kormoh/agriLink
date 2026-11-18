import "server-only";
import { prisma } from "@agripay/db";
import {
  type RegisterFarmerData,
  csvFarmerRowSchema,
  currentSeason,
  registerFarmerSchema,
} from "@agripay/validation";
import { type Actor, can } from "@agripay/validation/permissions";
import { uuidFromString } from "../crypto";
import { forbidden } from "../errors";
import { registerFarmer } from "./service";

export const MAX_IMPORT_ROWS = 2000;

export interface ImportPreview {
  valid: { row: number; data: RegisterFarmerData; label: string }[];
  invalid: { row: number; errors: string[]; raw: Record<string, unknown> }[];
}

/**
 * Validate CSV rows (module 02, step 11) without writing anything.
 * Resolves district codes, chiefdom names and crop codes to IDs and checks for repeated phones in the file.
 */
export async function previewImport(
  actor: Actor,
  rows: Record<string, unknown>[],
): Promise<ImportPreview> {
  if (!can(actor, "farmer.import")) throw forbidden();
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Maximum ${MAX_IMPORT_ROWS} rows per import.`);

  const [districts, crops] = await Promise.all([
    prisma.district.findMany({ include: { chiefdoms: true } }),
    prisma.crop.findMany({ where: { active: true } }),
  ]);
  const districtByCode = new Map(districts.map((d) => [d.code, d]));
  const cropByCode = new Map(crops.map((c) => [c.code, c]));
  const coopId = actor.role === "SUPER_ADMIN" ? null : actor.orgId;
  const season = currentSeason();
  const seenPhones = new Map<string, number>();

  const preview: ImportPreview = { valid: [], invalid: [] };
  rows.forEach((raw, i) => {
    const rowNumber = i + 2; // header is row 1
    const parsed = csvFarmerRowSchema.safeParse(raw);
    if (!parsed.success) {
      preview.invalid.push({
        row: rowNumber,
        raw,
        errors: parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`),
      });
      return;
    }
    const r = parsed.data;
    const errors: string[] = [];
    const district = districtByCode.get(r.district_code);
    if (!district) errors.push(`district_code: unknown code ${r.district_code}`);
    const chiefdom = district?.chiefdoms.find(
      (c) => c.name.toLowerCase() === r.chiefdom.toLowerCase(),
    );
    if (district && !chiefdom) errors.push(`chiefdom: "${r.chiefdom}" is not in ${district.name}`);
    const crop = cropByCode.get(r.crop_code);
    if (!crop) errors.push(`crop_code: unknown crop ${r.crop_code}`);
    const firstRow = seenPhones.get(r.phone);
    if (firstRow) errors.push(`phone: same phone as row ${firstRow}`);
    else seenPhones.set(r.phone, rowNumber);

    if (errors.length || !district || !chiefdom || !crop) {
      preview.invalid.push({ row: rowNumber, raw, errors });
      return;
    }
    const data = registerFarmerSchema.parse({
      clientRef: uuidFromString(
        `csv:${coopId ?? "platform"}:${r.phone}:${r.full_name.toLowerCase()}`,
      ),
      cooperativeId: coopId,
      consentToRegister: true,
      fullName: r.full_name,
      gender: r.gender,
      dateOfBirth: r.date_of_birth,
      nin: r.nin,
      hasDisability: false,
      districtId: district.id,
      chiefdomId: chiefdom.id,
      community: r.community,
      phone: r.phone,
      walletProvider: r.wallet_provider,
      walletMsisdn: null,
      sizeAcres: r.farm_size_acres,
      cropId: crop.id,
      season,
    });
    preview.valid.push({ row: rowNumber, data, label: `${r.full_name} · ${r.phone}` });
  });
  return preview;
}

/** Commit previously previewed rows. Re-validates everything; idempotent through deterministic clientRefs. */
export async function commitImport(actor: Actor, rows: Record<string, unknown>[]) {
  const preview = await previewImport(actor, rows);
  let created = 0;
  let existing = 0;
  let duplicates = 0;
  const failed: { row: number; error: string }[] = [];
  for (const { row, data } of preview.valid) {
    try {
      const r = await registerFarmer(actor, data, "CSV");
      if (r.created) created++;
      else existing++;
      if (r.duplicateOf) duplicates++;
    } catch (e) {
      failed.push({ row, error: (e as Error).message });
    }
  }
  return { created, existing, duplicates, failed, invalid: preview.invalid.length };
}
