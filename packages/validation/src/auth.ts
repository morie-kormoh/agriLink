import { z } from "zod";
import { Role } from "@agrilink/db/enums";
import { phoneSL } from "./phone";

export const otpRequestSchema = z.object({
  phone: phoneSL,
});

export const otpVerifySchema = z.object({
  phone: phoneSL,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export const pinSchema = z
  .string()
  .regex(/^\d{4,5}$/, "PIN must be 4 or 5 digits")
  .refine((p) => !/^(\d)\1+$/.test(p), "PIN cannot be all the same digit")
  .refine(
    (p) => !["1234", "12345", "4321", "54321", "0000"].includes(p),
    "Choose a less obvious PIN",
  );

export const setPinSchema = z
  .object({
    currentPin: z.string().optional(),
    pin: pinSchema,
    confirmPin: z.string(),
  })
  .refine((v) => v.pin === v.confirmPin, { path: ["confirmPin"], message: "PINs do not match" });

export const verifyPinSchema = z.object({
  phone: phoneSL,
  pin: z.string().regex(/^\d{4,5}$/),
});

export const inviteMemberSchema = z.object({
  phone: phoneSL,
  role: z.enum(Role),
  name: z.string().trim().max(120).optional(),
});

export const selectContextSchema = z.object({
  orgId: z.string().nullable(),
  role: z.enum(Role),
});
