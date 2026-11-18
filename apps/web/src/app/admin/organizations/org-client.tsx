"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { OrgType } from "@agripay/db/enums";
import { Button } from "@agripay/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@agripay/ui/components/dialog";
import { Input } from "@agripay/ui/components/input";
import { Label } from "@agripay/ui/components/label";
import { Switch } from "@agripay/ui/components/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@agripay/ui/components/select";
import { toast } from "@agripay/ui/components/sonner";
import { createOrganizationAction, setOrganizationActiveAction } from "@/app/actions/admin";

export function NewOrganizationDialog({
  districts,
}: {
  districts: { id: string; name: string }[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: "",
    type: "COOPERATIVE" as OrgType,
    districtId: "",
    adminPhone: "",
    adminName: "",
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> {t("admin.newOrg")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("admin.newOrg")}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await createOrganizationAction({
                ...form,
                districtId: form.districtId || null,
                adminPhone: form.adminPhone || null,
                adminName: form.adminName || null,
              });
              if (!res.ok) return void toast.error(res.error);
              toast.success(
                form.adminPhone ? t("team.inviteSent", { phone: form.adminPhone }) : form.name,
              );
              setOpen(false);
              setForm({
                name: "",
                type: "COOPERATIVE",
                districtId: "",
                adminPhone: "",
                adminName: "",
              });
              router.refresh();
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="org-name">{t("admin.orgName")}</Label>
            <Input
              id="org-name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("admin.orgType")}</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as OrgType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(OrgType).map((ty) => (
                    <SelectItem key={ty} value={ty}>
                      {ty}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("farmer.fields.district")}</Label>
              <Select
                value={form.districtId || undefined}
                onValueChange={(v) => setForm({ ...form, districtId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("common.optional")} />
                </SelectTrigger>
                <SelectContent>
                  {districts.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="admin-phone">{t("admin.adminPhone")}</Label>
              <Input
                id="admin-phone"
                type="tel"
                value={form.adminPhone}
                onChange={(e) => setForm({ ...form, adminPhone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-name">{t("team.name")}</Label>
              <Input
                id="admin-name"
                value={form.adminName}
                onChange={(e) => setForm({ ...form, adminName: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OrgActiveToggle({ orgId, active }: { orgId: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={active}
      disabled={pending}
      aria-label="Active"
      onCheckedChange={(v) =>
        startTransition(async () => {
          const res = await setOrganizationActiveAction(orgId, v);
          if (!res.ok) return void toast.error(res.error);
          router.refresh();
        })
      }
    />
  );
}
