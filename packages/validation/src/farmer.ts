import { z } from "zod";
import { Gender, LandTenure, MobileMoneyProvider } from "@agrilink/db/enums";
import { phoneSL } from "./phone";
import { seasonCode } from "./common";

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** ISO date "YYYY-MM-DD" (or empty) → Date | null. Must be a plausible adult farmer DOB. */
export const dateOfBirthSchema = z
  .union([z.string(), z.date()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === undefined || v === null || v === "") return null;
    const d = v instanceof Date ? v : new Date(`${v}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date" });
      return z.NEVER;
    }
    const now = new Date();
    const age = now.getUTCFullYear() - d.getUTCFullYear();
    if (age < 15 || age > 110) {
      ctx.addIssue({ code: "custom", message: "Date of birth looks wrong (age must be 15–110)" });
      return z.NEVER;
    }
    return d;
  });

/** NIN: alphanumeric, 6–20 chars after removing spaces/dashes. */
export const ninSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (!v) return null;
    const clean = v.replace(/[\s-]/g, "").toUpperCase();
    if (!/^[A-Z0-9]{6,20}$/.test(clean)) {
      ctx.addIssue({ code: "custom", message: "NIN should be 6–20 letters/numbers" });
      return z.NEVER;
    }
    return clean;
  });

export const farmerPersonSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, "Enter the farmer's full name")
    .max(120)
    .transform((v) => v.replace(/\s+/g, " ")),
  gender: z.enum(Gender),
  dateOfBirth: dateOfBirthSchema,
  nin: ninSchema,
  hasDisability: z.boolean().default(false),
  householdSize: z.coerce.number().int().min(1).max(60).optional().nullable(),
  isHouseholdHead: z.boolean().optional().nullable(),
});

export const farmerLocationSchema = z.object({
  districtId: z.string().min(1, "Select a district"),
  chiefdomId: z.string().min(1, "Select a chiefdom"),
  community: z.string().trim().min(2, "Enter the community / village").max(120),
});

export const farmerContactSchema = z.object({
  phone: phoneSL,
  walletProvider: z.enum(MobileMoneyProvider).optional().nullable(),
  /** Defaults to the phone number when empty. */
  walletMsisdn: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .pipe(z.union([z.null(), phoneSL])),
});

export const farmerFarmSchema = z.object({
  plotName: optionalString(80),
  sizeAcres: z.coerce.number().positive("Farm size must be more than 0").max(1000),
  tenure: z.enum(LandTenure).optional().nullable(),
  cropId: z.string().min(1, "Select the main crop"),
  season: seasonCode,
  latitude: z.number().min(6.8).max(10.1).optional().nullable(), // Sierra Leone bounding box
  longitude: z.number().min(-13.4).max(-10.2).optional().nullable(),
  gpsAccuracyM: z.number().min(0).optional().nullable(),
});

export const registerFarmerSchema = z
  .object({
    clientRef: z.uuid().optional().nullable(),
    cooperativeId: z.string().optional().nullable(),
    consentToRegister: z.literal(true, {
      error: "The farmer must agree to be registered",
    }),
    capturedAt: z.coerce.date().optional().nullable(),
  })
  .and(farmerPersonSchema)
  .and(farmerLocationSchema)
  .and(farmerContactSchema)
  .and(farmerFarmSchema);

export type RegisterFarmerInput = z.input<typeof registerFarmerSchema>;
export type RegisterFarmerData = z.output<typeof registerFarmerSchema>;

export const syncFarmersSchema = z.object({
  records: z.array(z.unknown()).min(1).max(25),
});

export const updateFarmerSchema = z
  .object({
    fullName: farmerPersonSchema.shape.fullName.optional(),
    gender: z.enum(Gender).optional(),
    dateOfBirth: dateOfBirthSchema,
    nin: ninSchema,
    hasDisability: z.boolean().optional(),
    householdSize: z.coerce.number().int().min(1).max(60).optional().nullable(),
    isHouseholdHead: z.boolean().optional().nullable(),
    community: z.string().trim().min(2).max(120).optional(),
    chiefdomId: z.string().optional(),
    cooperativeId: z.string().optional().nullable(),
  })
  .partial();

export const addWalletSchema = z.object({
  provider: z.enum(MobileMoneyProvider),
  msisdn: phoneSL,
  isPrimary: z.boolean().default(false),
});

export const addPlotSchema = z.object({
  name: optionalString(80),
  sizeAcres: z.coerce.number().positive().max(1000),
  tenure: z.enum(LandTenure).optional().nullable(),
  latitude: farmerFarmSchema.shape.latitude,
  longitude: farmerFarmSchema.shape.longitude,
  gpsAccuracyM: farmerFarmSchema.shape.gpsAccuracyM,
});

export const addCropCycleSchema = z.object({
  plotId: z.string().min(1),
  cropId: z.string().min(1),
  season: seasonCode,
  plantedAt: z.coerce.date().optional().nullable(),
  expectedHarvest: z.coerce.date().optional().nullable(),
  expectedYieldKg: z.coerce.number().positive().optional().nullable(),
});

export const farmerSearchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "DUPLICATE_SUSPECTED", "DRAFT"]).optional(),
  gender: z.enum(Gender).optional(),
  districtId: z.string().optional(),
  chiefdomId: z.string().optional(),
  cropId: z.string().optional(),
  kycTier: z.coerce.number().int().min(1).max(3).optional(),
  youth: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type FarmerSearch = z.infer<typeof farmerSearchSchema>;

/**
 * One CSV row of the co-op import template.
 * Header: full_name,gender,phone,date_of_birth,nin,district_code,chiefdom,community,crop_code,farm_size_acres,wallet_provider
 */
export const csvFarmerRowSchema = z.object({
  full_name: z.string().trim().min(3).max(120),
  gender: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .transform((v) => (v === "F" ? "FEMALE" : v === "M" ? "MALE" : v))
    .pipe(z.enum(Gender)),
  phone: phoneSL,
  date_of_birth: dateOfBirthSchema,
  nin: ninSchema,
  district_code: z.string().trim().toUpperCase().length(3),
  chiefdom: z.string().trim().min(2),
  community: z.string().trim().min(2).max(120),
  crop_code: z.string().trim().toUpperCase().min(2),
  farm_size_acres: z.coerce.number().positive().max(1000),
  wallet_provider: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.toUpperCase().replace(/\s+/g, "_") : null))
    .pipe(z.union([z.null(), z.enum(MobileMoneyProvider)])),
});
export type CsvFarmerRow = z.output<typeof csvFarmerRowSchema>;

export const CSV_TEMPLATE_HEADER =
  "full_name,gender,phone,date_of_birth,nin,district_code,chiefdom,community,crop_code,farm_size_acres,wallet_provider";
