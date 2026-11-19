import { translateText } from "@agrilink/i18n";

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "LOCKED"
  | "PROVIDER_ERROR";

/** Expected, user-facing error. `messageKey` is an i18n key the UI can translate. */
export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly messageKey?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (msg = "You do not have permission to do this.") =>
  new AppError("FORBIDDEN", msg);
export const notFound = (what = "Record") => new AppError("NOT_FOUND", `${what} not found.`);

const STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  LOCKED: 423,
  PROVIDER_ERROR: 502,
};

export function httpStatus(err: unknown): number {
  return err instanceof AppError ? STATUS[err.code] : 500;
}

/** Shape returned by server actions so client components can show errors without try/catch. */
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | {
      ok: false;
      error: string;
      code?: AppErrorCode;
      messageKey?: string;
      fieldErrors?: Record<string, string[]>;
    };

/** The signed-in person's UI language (cookie), or undefined outside a request. */
async function requestLocale(): Promise<string | undefined> {
  try {
    const { cookies } = await import("next/headers");
    return (await cookies()).get("NEXT_LOCALE")?.value;
  } catch {
    return undefined;
  }
}

/**
 * Turn an error into the result a server action returns. Messages are translated into the
 * person's language (Krio) when a translation exists; codes and keys stay as they are.
 */
export async function toActionError(err: unknown): Promise<Extract<ActionResult, { ok: false }>> {
  const result = toActionErrorEn(err);
  const locale = await requestLocale();
  if (locale !== "kri") return result;
  return {
    ...result,
    error: translateText(locale, result.error),
    ...(result.fieldErrors
      ? {
          fieldErrors: Object.fromEntries(
            Object.entries(result.fieldErrors).map(([k, v]) => [
              k,
              v.map((m) => translateText(locale, m)),
            ]),
          ),
        }
      : {}),
  };
}

function toActionErrorEn(err: unknown): Extract<ActionResult, { ok: false }> {
  if (err instanceof AppError) {
    return { ok: false, error: err.message, code: err.code, messageKey: err.messageKey };
  }
  if (
    err &&
    typeof err === "object" &&
    "issues" in err &&
    Array.isArray((err as { issues: unknown[] }).issues)
  ) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of (err as { issues: { path: PropertyKey[]; message: string }[] }).issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      code: "VALIDATION",
      fieldErrors,
    };
  }
  // Re-throw Next.js control-flow errors (redirect / notFound)
  if (
    err &&
    typeof err === "object" &&
    "digest" in err &&
    String((err as { digest: unknown }).digest).startsWith("NEXT_")
  ) {
    throw err;
  }
  console.error(err);
  return { ok: false, error: "Something went wrong. Please try again." };
}
