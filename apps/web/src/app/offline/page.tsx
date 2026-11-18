import Link from "next/link";
import { WifiOffIcon } from "lucide-react";

// Served by the service worker when a page isn't cached and the device is offline.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="bg-secondary text-primary rounded-full p-4">
        <WifiOffIcon className="size-8" />
      </span>
      <h1 className="text-xl font-semibold">You are offline</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        This page has not been saved on this device yet. Farmer registration still works offline —
        open it from the menu. Your saved registrations will sync when you are back online.
      </p>
      <Link className="text-primary font-medium underline" href="/agent/farmers/new">
        Register a farmer
      </Link>
    </main>
  );
}
