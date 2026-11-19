import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarIcon, RefreshCwIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { prisma } from "@agrilink/db";
import { Button } from "@agrilink/ui/components/button";
import { PageHeader, StatCard } from "@agrilink/ui/components/blocks";
import { PendingList } from "@/components/farmers/pending-list";
import { requirePortal } from "@/server/auth/actor";

export default async function AgentHome() {
  const { actor, user } = await requirePortal("/agent");
  const t = await getTranslations();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [mine, thisWeek, women] = await Promise.all([
    prisma.farmer.count({ where: { registeredById: actor.userId } }),
    prisma.farmer.count({ where: { registeredById: actor.userId, createdAt: { gte: weekAgo } } }),
    prisma.farmer.count({ where: { registeredById: actor.userId, gender: "FEMALE" } }),
  ]);

  return (
    <>
      <PageHeader
        title={`${t("nav.dashboard")} · ${user.name ?? ""}`}
        actions={
          <Button asChild size="lg">
            <Link href="/agent/farmers/new">
              <UserPlusIcon /> {t("nav.registerFarmer")}
            </Link>
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("farmer.registered")} value={mine} icon={UsersIcon} />
        <StatCard label="Last 7 days" value={thisWeek} icon={CalendarIcon} />
        <StatCard
          label={t("admin.women")}
          value={mine ? `${Math.round((women / mine) * 100)}%` : "—"}
          icon={RefreshCwIcon}
        />
      </div>
      <PendingList />
    </>
  );
}
