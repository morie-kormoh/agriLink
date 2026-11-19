"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, TagIcon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agrilink/ui/components/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agrilink/ui/components/table";
import { formatLe } from "@agrilink/validation";
import { setPriceAction } from "@/app/actions/trade";

export function PricesManager({
  crops,
  prices,
  canManage,
}: {
  crops: { id: string; name: string }[];
  prices: {
    id: string;
    crop: string;
    cropId: string;
    grade: string | null;
    unit: string;
    priceLe: string;
    validFrom: string;
  }[];
  canManage: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [form, setForm] = useState({
    cropId: crops[0]?.id ?? "",
    grade: "",
    unit: "kg",
    priceLe: "",
  });
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TagIcon className="size-4" /> {t("trade.setPrice")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-[1fr_8rem_7rem_9rem_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const r = await setPriceAction({
                    ...form,
                    grade: form.grade || null,
                    unit: form.unit as "kg",
                  });
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(t("common.save"));
                  setForm((f) => ({ ...f, priceLe: "", grade: "" }));
                  router.refresh();
                });
              }}
            >
              <div className="space-y-2">
                <Label>{t("trade.crop")}</Label>
                <Select value={form.cropId} onValueChange={(v) => setForm({ ...form, cropId: v })}>
                  <SelectTrigger aria-label={t("trade.crop")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {crops.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pgrade">{t("trade.grade")}</Label>
                <Input
                  id="pgrade"
                  placeholder={t("trade.anyGrade")}
                  value={form.grade}
                  onChange={(e) => setForm({ ...form, grade: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("trade.unit")}</Label>
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                  <SelectTrigger aria-label={t("trade.unit")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="bag">bag</SelectItem>
                    <SelectItem value="tonne">tonne</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pprice">Le</Label>
                <Input
                  id="pprice"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  required
                  value={form.priceLe}
                  onChange={(e) => setForm({ ...form, priceLe: e.target.value })}
                />
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2Icon className="animate-spin" /> : null}
                {t("common.save")}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
      <div className="bg-card overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("trade.crop")}</TableHead>
              <TableHead>{t("trade.grade")}</TableHead>
              <TableHead className="text-right">Le</TableHead>
              <TableHead>{t("trade.validFrom")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground h-20 text-center">
                  {t("common.noResults")}
                </TableCell>
              </TableRow>
            ) : (
              prices.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.crop}</TableCell>
                  <TableCell>{p.grade ?? t("trade.anyGrade")}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatLe(p.priceLe)} / {p.unit}
                  </TableCell>
                  <TableCell className="text-xs">
                    {new Date(p.validFrom).toLocaleString("en-GB")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
