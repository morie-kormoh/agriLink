"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, SendIcon, XIcon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
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
import { formatSlPhone } from "@agrilink/validation";
import { inviteMemberAction, removeMemberAction, revokeInvitationAction } from "@/app/actions/team";

export function InviteMemberForm({ roles }: { roles: { value: string; label: string }[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [form, setForm] = useState({ phone: "", name: "", role: roles[0]?.value ?? "" });
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-4 sm:grid-cols-[1fr_1fr_12rem_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await inviteMemberAction(form);
          if (!res.ok) return void toast.error(res.error);
          toast.success(t("team.inviteSent", { phone: formatSlPhone(res.data.phone) }));
          setForm({ ...form, phone: "", name: "" });
          router.refresh();
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="inv-phone">{t("team.phone")}</Label>
        <Input
          id="inv-phone"
          type="tel"
          required
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="inv-name">{t("team.name")}</Label>
        <Input
          id="inv-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("team.role")}</Label>
        <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
        {t("team.invite")}
      </Button>
    </form>
  );
}

function ConfirmButton({
  label,
  onConfirm,
}: {
  label: string;
  onConfirm: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (!confirm(`${label}?`)) return;
        startTransition(async () => {
          const res = await onConfirm();
          if (!res.ok) return void toast.error(res.error);
          router.refresh();
        });
      }}
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <XIcon />} {label}
    </Button>
  );
}

export function RevokeInviteButton({ id, label }: { id: string; label: string }) {
  return <ConfirmButton label={label} onConfirm={() => revokeInvitationAction(id)} />;
}

export function RemoveMemberButton({ id, label }: { id: string; label: string }) {
  return <ConfirmButton label={label} onConfirm={() => removeMemberAction(id)} />;
}
