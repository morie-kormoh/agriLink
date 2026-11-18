"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Papa from "papaparse";
import { DownloadIcon, FileUpIcon, Loader2Icon, UploadIcon } from "lucide-react";
import { Badge } from "@agripay/ui/components/badge";
import { Button } from "@agripay/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@agripay/ui/components/card";
import { toast } from "@agripay/ui/components/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agripay/ui/components/table";
import { commitImportAction, previewImportAction } from "@/app/actions/farmers";

type Preview = {
  valid: { row: number; label: string }[];
  invalid: { row: number; errors: string[] }[];
};

/** CSV import: download template → choose file → server dry-run preview → commit. */
export function ImportFarmers({ doneHref }: { doneHref: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, startTransition] = useTransition();

  function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setPreview(null);
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (result) => {
        setRows(result.data);
        startTransition(async () => {
          const res = await previewImportAction(result.data);
          if (!res.ok) return void toast.error(res.error);
          setPreview(res.data);
        });
      },
      error: (err) => toast.error(err.message),
    });
  }

  function commit() {
    if (!rows) return;
    startTransition(async () => {
      const res = await commitImportAction(rows);
      if (!res.ok) return void toast.error(res.error);
      toast.success(
        t("import.imported", { created: res.data.created, duplicates: res.data.duplicates }),
      );
      if (res.data.failed.length)
        toast.warning(
          `${res.data.failed.length} rows failed: ${res.data.failed.map((f) => f.row).join(", ")}`,
        );
      router.push(doneHref);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("import.title")}</CardTitle>
          <CardDescription>{t("import.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" asChild>
            <a href="/api/farmers/import-template">
              <DownloadIcon /> {t("import.downloadTemplate")}
            </a>
          </Button>
          <Button asChild variant="secondary">
            <label className="cursor-pointer">
              <FileUpIcon /> {fileName ?? t("import.chooseFile")}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
          </Button>
          {pending ? (
            <Loader2Icon className="text-muted-foreground size-5 animate-spin self-center" />
          ) : null}
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Badge variant="success">
                {t("import.validRows", { count: preview.valid.length })}
              </Badge>
              {preview.invalid.length ? (
                <Badge variant="destructive">
                  {t("import.invalidRows", { count: preview.invalid.length })}
                </Badge>
              ) : null}
            </div>
            <Button disabled={pending || preview.valid.length === 0} onClick={commit}>
              {pending ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
              {t("import.commit", { count: preview.valid.length })}
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">{t("import.row")}</TableHead>
                  <TableHead>{t("farmer.name")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  ...preview.invalid.map((r) => ({ ...r, ok: false as const, label: "" })),
                  ...preview.valid.map((r) => ({
                    ...r,
                    ok: true as const,
                    errors: [] as string[],
                  })),
                ]
                  .sort((a, b) => a.row - b.row)
                  .map((r) => (
                    <TableRow key={r.row}>
                      <TableCell>{r.row}</TableCell>
                      <TableCell className="whitespace-normal">
                        {r.ok ? (
                          r.label
                        ) : (
                          <span className="text-destructive">{r.errors.join("; ")}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.ok ? "success" : "destructive"}>
                          {r.ok ? "OK" : t("farmer.error")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
