import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/server/api";
import { requireActor } from "@/server/auth/actor";
import { notFound } from "@/server/errors";
import { getFarmer, setFarmerPhoto } from "@/server/farmers/service";
import { presignDownload, presignFarmerPhotoUpload } from "@/server/storage";

type Ctx = { params: Promise<{ id: string }> };

/** POST { contentType } → presigned upload { url, key } */
export const POST = api(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { actor } = await requireActor();
  await getFarmer(actor, id); // authorisation
  const { contentType } = z.object({ contentType: z.string() }).parse(await request.json());
  return NextResponse.json(await presignFarmerPhotoUpload(id, contentType));
});

/** PUT { key } → attach the uploaded object to the farmer */
export const PUT = api(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { actor } = await requireActor();
  const { key } = z.object({ key: z.string().min(5) }).parse(await request.json());
  await setFarmerPhoto(actor, id, key);
  return NextResponse.json({ ok: true });
});

/** GET → redirect to a short-lived download URL */
export const GET = api(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { actor } = await requireActor();
  const farmer = await getFarmer(actor, id);
  if (!farmer.photoKey) throw notFound("Photo");
  return NextResponse.redirect(await presignDownload(farmer.photoKey), 302);
});
