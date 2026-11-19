import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";

/** Server-rendered pager that keeps the other search params. */
export async function Pagination({
  page,
  pages,
  total,
  searchParams,
  basePath,
}: {
  page: number;
  pages: number;
  total: number;
  searchParams: Record<string, string | string[] | undefined>;
  basePath: string;
}) {
  const t = await getTranslations("common");
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams))
      if (typeof v === "string" && k !== "page") sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <div className="text-muted-foreground mt-4 flex items-center justify-between gap-2 text-sm">
      <span>
        {total.toLocaleString("en")} · {t("page", { page, total: pages })}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild disabled={page <= 1}>
          {page <= 1 ? (
            <span aria-disabled>
              <ChevronLeftIcon /> {t("previous")}
            </span>
          ) : (
            <Link href={href(page - 1)}>
              <ChevronLeftIcon /> {t("previous")}
            </Link>
          )}
        </Button>
        <Button variant="outline" size="sm" asChild disabled={page >= pages}>
          {page >= pages ? (
            <span aria-disabled>
              {t("next")} <ChevronRightIcon />
            </span>
          ) : (
            <Link href={href(page + 1)}>
              {t("next")} <ChevronRightIcon />
            </Link>
          )}
        </Button>
      </div>
    </div>
  );
}
