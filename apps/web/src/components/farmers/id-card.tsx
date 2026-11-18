import { getTranslations } from "next-intl/server";
import { SproutIcon, UserRoundIcon } from "lucide-react";

/** Printable AgriPay Farmer ID card. */
export async function FarmerIdCard({
  agripayId,
  fullName,
  district,
  cooperative,
  photoUrl,
  kycTier,
}: {
  agripayId: string;
  fullName: string;
  district: string;
  cooperative: string | null;
  photoUrl: string | null;
  kycTier: number;
}) {
  const t = await getTranslations();
  return (
    <div className="from-primary text-primary-foreground overflow-hidden rounded-2xl bg-gradient-to-br to-[oklch(0.4_0.1_155)] p-5 shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="bg-accent text-accent-foreground rounded-md p-1">
            <SproutIcon className="size-4" />
          </span>
          {t("farmer.idCardTitle")}
        </span>
        <span className="rounded bg-white/15 px-2 py-0.5 text-xs">KYC T{kycTier}</span>
      </div>
      <div className="flex items-center gap-4">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="size-20 rounded-lg border-2 border-white/40 object-cover"
          />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-lg bg-white/15">
            <UserRoundIcon className="size-10 opacity-70" />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{fullName}</p>
          <p className="truncate text-sm opacity-80">{district}</p>
          {cooperative ? <p className="truncate text-xs opacity-80">{cooperative}</p> : null}
        </div>
      </div>
      <p className="text-accent mt-5 font-mono text-2xl font-bold tracking-widest">{agripayId}</p>
    </div>
  );
}
