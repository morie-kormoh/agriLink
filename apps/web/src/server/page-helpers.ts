import "server-only";
import { notFound } from "next/navigation";
import { AppError } from "./errors";

/** Render a server component; unknown or out-of-scope records become a 404 page (never leak existence). */
export async function notFoundOn404<T>(render: () => Promise<T>): Promise<T> {
  try {
    return await render();
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
}
