import "server-only";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";
import { AppError } from "./errors";
import { randomToken } from "./crypto";

let client: S3Client | null = null;

function s3(): S3Client {
  const e = env();
  if (!e.S3_ENDPOINT || !e.S3_ACCESS_KEY || !e.S3_SECRET_KEY) {
    throw new AppError("PROVIDER_ERROR", "File storage is not configured (S3_* variables).");
  }
  client ??= new S3Client({
    endpoint: e.S3_ENDPOINT,
    region: e.S3_REGION,
    forcePathStyle: true, // MinIO
    credentials: { accessKeyId: e.S3_ACCESS_KEY, secretAccessKey: e.S3_SECRET_KEY },
  });
  return client;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_PHOTO_BYTES = 400 * 1024;

/** Presigned PUT for a farmer photo (client compresses to ≤ 200 KB first). */
export async function presignFarmerPhotoUpload(farmerId: string, contentType: string) {
  if (!ALLOWED_IMAGE_TYPES.has(contentType))
    throw new AppError("VALIDATION", "Photo must be JPEG, PNG or WebP.");
  const ext = contentType.split("/")[1];
  const key = `farmers/${farmerId}/photo-${randomToken(8)}.${ext}`;
  const url = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );
  return { key, url, maxBytes: MAX_PHOTO_BYTES };
}

export async function presignDownload(key: string, expiresIn = 300) {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }), {
    expiresIn,
  });
}
