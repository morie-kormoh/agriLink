import { getTranslations } from "next-intl/server";
import { SproutIcon, UserRoundIcon } from "lucide-react";

/** Printable AgriLink Farmer ID card. */
export async function FarmerIdCard({
  agrilinkId,
  fullName,
  district,
  cooperative,
  photoUrl,
  kycTier,
}: {
  agrilinkId: string;
  fullName: string;
  district: string;
  cooperative: string | null;
  photoUrl: string | null;
  kycTier: number;
}) {
  const t = await getTranslations();
  return (
    <div className="bg-indigo gara overflow-hidden rounded-[var(--radius-money)] p-5 text-white">
      <div className="mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="bg-gold text-ink rounded-md p-1">
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
          <p className="font-display truncate text-lg font-bold">{fullName}</p>
          <p className="truncate text-sm opacity-80">{district}</p>
          {cooperative ? <p className="truncate text-xs opacity-80">{cooperative}</p> : null}
        </div>
      </div>
      <p className="text-gold mt-5 font-mono text-2xl font-medium tracking-widest">{agrilinkId}</p>
    </div>
  );
}
