import Link from "next/link";
import { SproutIcon } from "lucide-react";
import { LanguageSwitcher } from "@/components/shell/language-switcher";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-secondary/40 flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-md items-center justify-between p-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="bg-primary text-primary-foreground rounded-md p-1.5">
            <SproutIcon className="size-5" />
          </span>
          AgriPay
        </Link>
        <LanguageSwitcher className="w-auto" />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center p-4 pb-16">
        {children}
      </main>
    </div>
  );
}
