"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  HandCoinsIcon,
  Loader2Icon,
  MessageSquareIcon,
  PlusIcon,
  UserPlusIcon,
} from "lucide-react";
import { Button } from "@agripay/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agripay/ui/components/card";
import { Input } from "@agripay/ui/components/input";
import { Label } from "@agripay/ui/components/label";
import { Checkbox } from "@agripay/ui/components/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@agripay/ui/components/select";
import { toast } from "@agripay/ui/components/sonner";
import {
  addGroupMemberAction,
  createGroupAction,
  recordContributionAction,
  recordPayoutAction,
  sendGroupStatementsAction,
} from "@/app/actions/finance";

type R = { ok: true; data?: unknown } | { ok: false; error: string };

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (fn: () => Promise<R>, ok: string, after?: (d: unknown) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(ok);
      after?.(r.data);
      router.refresh();
    });
  return { pending, go, router };
}

function Pick({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function CreateGroupForm() {
  const t = useTranslations("groups");
  const { pending, go, router } = useAct();
  const today = new Date().toISOString().slice(0, 10);
  const yearOn = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
  const [f, setF] = useState({
    name: "",
    type: "VSLA",
    contributionLe: "50",
    frequency: "WEEKLY",
    cycleStart: today,
    cycleEnd: yearOn,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlusIcon className="size-4" /> {t("create")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            go(
              () =>
                createGroupAction({
                  ...f,
                  type: f.type as "VSLA",
                  frequency: f.frequency as "WEEKLY",
                }),
              t("create"),
              (d) => router.push(`/coop/groups/${(d as { id: string }).id}`),
            );
          }}
        >
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="gname">{t("name")}</Label>
            <Input
              id="gname"
              required
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </div>
          <Pick
            label={t("type")}
            value={f.type}
            onChange={(v) => setF({ ...f, type: v })}
            options={["VSLA", "OSUSU_ROTATING", "GOAL"].map((v) => ({
              value: v,
              label: t(`types.${v}` as never),
            }))}
          />
          <div className="space-y-1">
            <Label htmlFor="gcontrib">{t("contribution")}</Label>
            <Input
              id="gcontrib"
              type="number"
              min="1"
              required
              value={f.contributionLe}
              onChange={(e) => setF({ ...f, contributionLe: e.target.value })}
            />
          </div>
          <Pick
            label={t("frequency")}
            value={f.frequency}
            onChange={(v) => setF({ ...f, frequency: v })}
            options={["WEEKLY", "MONTHLY"].map((v) => ({ value: v, label: t(v as never) }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="gstart">{t("cycleStart")}</Label>
              <Input
                id="gstart"
                type="date"
                required
                value={f.cycleStart}
                onChange={(e) => setF({ ...f, cycleStart: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gend">{t("cycleEnd")}</Label>
              <Input
                id="gend"
                type="date"
                required
                value={f.cycleEnd}
                onChange={(e) => setF({ ...f, cycleEnd: e.target.value })}
              />
            </div>
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} {t("create")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function AddMemberForm({
  groupId,
  farmers,
}: {
  groupId: string;
  farmers: { id: string; label: string }[];
}) {
  const t = useTranslations("groups");
  const { pending, go } = useAct();
  const [f, setF] = useState({
    farmerId: farmers[0]?.id ?? "",
    role: "MEMBER",
    payoutOrder: "",
    guarantor: false,
  });
  if (!farmers.length) return null;
  return (
    <form
      className="grid gap-3 sm:grid-cols-[2fr_1fr_8rem_auto_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        go(
          () =>
            addGroupMemberAction(groupId, {
              farmerId: f.farmerId,
              role: f.role as "MEMBER",
              payoutOrder: f.payoutOrder ? Number(f.payoutOrder) : null,
              guarantor: f.guarantor,
            }),
          t("addMember"),
        );
      }}
    >
      <Pick
        label={t("members")}
        value={f.farmerId}
        onChange={(v) => setF({ ...f, farmerId: v })}
        options={farmers.map((x) => ({ value: x.id, label: x.label }))}
      />
      <Pick
        label={t("role")}
        value={f.role}
        onChange={(v) => setF({ ...f, role: v })}
        options={["MEMBER", "CHAIR", "TREASURER", "SECRETARY"].map((v) => ({
          value: v,
          label: t(`roles.${v}` as never),
        }))}
      />
      <div className="space-y-1">
        <Label htmlFor="porder">{t("payoutOrder")}</Label>
        <Input
          id="porder"
          type="number"
          min="1"
          value={f.payoutOrder}
          onChange={(e) => setF({ ...f, payoutOrder: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <Checkbox
          checked={f.guarantor}
          onCheckedChange={(v) => setF({ ...f, guarantor: v === true })}
        />{" "}
        {t("guarantor")}
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : <UserPlusIcon />} {t("addMember")}
      </Button>
    </form>
  );
}

export function ContributionForm({
  groupId,
  members,
  defaultAmount,
  currentPeriod,
  periods,
}: {
  groupId: string;
  members: { id: string; label: string }[];
  defaultAmount: string;
  currentPeriod: number;
  periods: number;
}) {
  const t = useTranslations("groups");
  const { pending, go } = useAct();
  const [f, setF] = useState({
    farmerId: members[0]?.id ?? "",
    periodNo: String(Math.max(1, currentPeriod)),
    amountLe: defaultAmount,
    method: "CASH_RECORDED",
    reference: "",
  });
  if (!members.length) return null;
  return (
    <form
      className="grid gap-3 sm:grid-cols-[2fr_6rem_8rem_1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        go(
          () =>
            recordContributionAction(groupId, {
              farmerId: f.farmerId,
              periodNo: Number(f.periodNo),
              amountLe: f.amountLe,
              method: f.method as "CASH_RECORDED",
              reference: f.reference || null,
            }),
          t("record"),
        );
      }}
    >
      <Pick
        label={t("members")}
        value={f.farmerId}
        onChange={(v) => setF({ ...f, farmerId: v })}
        options={members.map((m) => ({ value: m.id, label: m.label }))}
      />
      <div className="space-y-1">
        <Label htmlFor="cperiod">{t("period")}</Label>
        <Input
          id="cperiod"
          type="number"
          min="1"
          max={periods}
          value={f.periodNo}
          onChange={(e) => setF({ ...f, periodNo: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="camount">Le</Label>
        <Input
          id="camount"
          type="number"
          min="1"
          value={f.amountLe}
          onChange={(e) => setF({ ...f, amountLe: e.target.value })}
        />
      </div>
      <Pick
        label={t("method")}
        value={f.method}
        onChange={(v) => setF({ ...f, method: v })}
        options={["CASH_RECORDED", "MOBILE_MONEY"].map((v) => ({ value: v, label: t(v as never) }))}
      />
      <div className="space-y-1">
        <Label htmlFor="cref">{t("reference")}</Label>
        <Input
          id="cref"
          value={f.reference}
          disabled={f.method !== "MOBILE_MONEY"}
          onChange={(e) => setF({ ...f, reference: e.target.value })}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} {t("record")}
      </Button>
    </form>
  );
}

export function GroupActions({
  groupId,
  payoutPeriod,
}: {
  groupId: string;
  payoutPeriod: number | null;
}) {
  const t = useTranslations("groups");
  const { pending, go } = useAct();
  return (
    <div className="flex flex-wrap gap-2">
      {payoutPeriod ? (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => go(() => recordPayoutAction(groupId, payoutPeriod), t("payout"))}
        >
          <HandCoinsIcon /> {t("payout")} ({t("period")} {payoutPeriod})
        </Button>
      ) : null}
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          go(() => sendGroupStatementsAction(groupId) as Promise<R>, t("smsSent", { n: "" }).trim())
        }
      >
        <MessageSquareIcon /> {t("sendSms")}
      </Button>
    </div>
  );
}
