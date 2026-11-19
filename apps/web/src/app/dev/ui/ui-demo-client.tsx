"use client";

import { useState } from "react";
import { Button } from "@agrilink/ui/components/button";
import { Label } from "@agrilink/ui/components/label";
import { Checkbox, Switch } from "@agrilink/ui/components/misc";
import { OtpInput } from "@agrilink/ui/components/otp-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@agrilink/ui/components/select";
import { toast } from "@agrilink/ui/components/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@agrilink/ui/components/tabs";

export function UiDemoClient() {
  const [otp, setOtp] = useState("");
  return (
    <div className="space-y-4">
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select a crop" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="rice">Rice</SelectItem>
          <SelectItem value="cocoa">Cocoa</SelectItem>
        </SelectContent>
      </Select>
      <Label className="flex items-center gap-3">
        <Checkbox /> Head of household
      </Label>
      <Label className="flex items-center gap-3">
        <Switch /> Has a disability
      </Label>
      <OtpInput value={otp} onChange={setOtp} onComplete={(v) => toast.success(`Code ${v}`)} />
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Main season</TabsTrigger>
          <TabsTrigger value="b">Dry season</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Rainy season records</TabsContent>
        <TabsContent value="b">Dry season records</TabsContent>
      </Tabs>
      <Button variant="outline" onClick={() => toast.success("Saved")}>
        Show toast
      </Button>
    </div>
  );
}
