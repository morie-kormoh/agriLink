import { notFound } from "next/navigation";
import { PiggyBankIcon, SproutIcon, UsersIcon, WalletIcon } from "lucide-react";
import { Badge } from "@agrilink/ui/components/badge";
import { EmptyState, Field, PageHeader, StatCard } from "@agrilink/ui/components/blocks";
import { Button } from "@agrilink/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@agrilink/ui/components/card";
import { Input } from "@agrilink/ui/components/input";
import { Label } from "@agrilink/ui/components/label";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Progress,
  Skeleton,
} from "@agrilink/ui/components/misc";
import { Stepper } from "@agrilink/ui/components/stepper";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agrilink/ui/components/table";
import { formatLe } from "@/lib/format";
import { UiDemoClient } from "./ui-demo-client";

/** Module 00 checkpoint: every UI kit component on one page (development only). */
export default function UiKitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-5xl space-y-10 p-4 sm:p-8">
      <PageHeader
        title="AgriLink UI kit"
        description="shadcn/ui + Radix + Tailwind v4 + Lucide — check at 360px width too."
      />

      <section className="space-y-3">
        <h2 className="font-semibold">Buttons & badges</h2>
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="accent">Accent</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              "default",
              "secondary",
              "success",
              "warning",
              "info",
              "destructive",
              "muted",
              "outline",
            ] as const
          ).map((v) => (
            <Badge key={v} variant={v}>
              {v}
            </Badge>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Farmers" value="5,000" hint="62% women" icon={UsersIcon} />
        <StatCard label="Paid to farmers" value={formatLe("400000")} icon={WalletIcon} />
        <StatCard label="Harvest Lock" value={formatLe("57000.5")} icon={PiggyBankIcon} />
        <StatCard label="Crops" value="10" icon={SproutIcon} />
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Form controls</CardTitle>
            <CardDescription>Inputs are 44px tall on phones.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="demo">Full name</Label>
              <Input id="demo" placeholder="Aminata Sesay" />
            </div>
            <UiDemoClient />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Feedback</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="success">
              <AlertTitle>Payment sent</AlertTitle>
              <AlertDescription>Le 6,800 sent to Orange Money.</AlertDescription>
            </Alert>
            <Alert variant="warning">
              <AlertTitle>Possible duplicate</AlertTitle>
              <AlertDescription>Matches AP-BOM-000012.</AlertDescription>
            </Alert>
            <Progress value={62} />
            <Skeleton className="h-6 w-1/2" />
            <dl className="grid grid-cols-2 gap-3">
              <Field label="AgriLink ID">AP-BOM-000123</Field>
              <Field label="KYC tier">T2</Field>
            </dl>
          </CardContent>
        </Card>
      </section>

      <Stepper steps={["Person", "Location", "Phone", "Farm", "Consent", "Review"]} current={2} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-mono">AP-BOM-000001</TableCell>
            <TableCell>Aminata Sesay</TableCell>
            <TableCell className="text-right">{formatLe(4000)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <EmptyState
        icon={UsersIcon}
        title="No farmers yet"
        description="Register your first farmer."
        action={<Button>Register</Button>}
      />
    </main>
  );
}
