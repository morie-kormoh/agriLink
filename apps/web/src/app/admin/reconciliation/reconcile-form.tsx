"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Papa from "papaparse";
import { FileUpIcon, Loader2Icon } from "lucide-react";
import { Badge } from "@agrilink/ui/components/badge";
import { Button } from "@agrilink/ui/components/button";
import { Card, CardContent } from "@agrilink/ui/components/card";
import { Input } from "@agrilink/ui/components/input";
import { Label } from "@agrilink/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@agrilink/ui/components/select";
import { toast } from "@agrilink/ui/components/sonner";
import { reconcileAction } from "@/app/actions/payments";

type Report = {
  matched: string[];
  mismatched: { providerRef: string; reason: string }[];
  missing: { providerRef: string; payment: string }[];
  unknown: { providerRef: string }[];
};

export function ReconcileForm() {
  const t = useTranslations("payments");
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [provider, setProvider] = useState("MOCK");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<
    { providerRef: string; amountLe: string; status: string }[] | null
  >(null);
  const [report, setReport] = useState<Report | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-4 sm:items-end">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger aria-label="Provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["MOCK", "ORANGE_MONEY", "AFRIMONEY", "QMONEY", "SAPS", "BANK"].map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rfrom">From</Label>
            <Input id="rfrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rto">To</Label>
            <Input id="rto" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button asChild variant="outline">
            <label className="cursor-pointer">
              <FileUpIcon /> {rows ? `${rows.length} rows` : "CSV"}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  Papa.parse<Record<string, string>>(f, {
                    header: true,
                    skipEmptyLines: "greedy",
                    transformHeader: (h) => h.trim(),
                    complete: (r) =>
                      setRows(
                        r.data
                          .map((x) => ({
                            providerRef: x.providerRef ?? x.reference ?? "",
                            amountLe: x.amountLe ?? x.amount ?? "",
                            status: x.status ?? "",
                          }))
                          .filter((x) => x.providerRef),
                      ),
                  });
                }}
              />
            </label>
          </Button>
        </div>
        <Button
          disabled={!rows || pending}
          onClick={() =>
            start(async () => {
              const r = await reconcileAction({
                provider: provider as "MOCK",
                from,
                to,
                rows: rows ?? [],
              });
              if (!r.ok) return void toast.error(r.error);
              setReport(r.data as unknown as Report);
              router.refresh();
            })
          }
        >
          {pending ? <Loader2Icon className="animate-spin" /> : null} Reconcile
        </Button>
        {report ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">
                {t("matched")}: {report.matched.length}
              </Badge>
              <Badge variant="warning">
                {t("mismatched")}: {report.mismatched.length}
              </Badge>
              <Badge variant="destructive">
                {t("missing")}: {report.missing.length}
              </Badge>
              <Badge variant="info">
                {t("unknown")}: {report.unknown.length}
              </Badge>
            </div>
            {[
              ...report.mismatched.map((m) => `${m.providerRef}: ${m.reason}`),
              ...report.missing.map((m) => `${m.providerRef} (${m.payment}): missing`),
              ...report.unknown.map((u) => `${u.providerRef}: not in AgriLink`),
            ].map((line) => (
              <p key={line} className="font-mono text-xs">
                {line}
              </p>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
