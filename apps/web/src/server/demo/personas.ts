import type { Role } from "@agrilink/db/enums";

/** The five people in the demo story (docs/mvp/demo-script.md). Only these can use one-click sign-in. */
export interface Persona {
  key: string;
  phone: string;
  role: Role;
  name: string;
  description: string;
}

export const PERSONAS: Persona[] = [
  {
    key: "coop-staff",
    phone: "+23276000004",
    role: "COOP_STAFF",
    name: "Co-op staff",
    description: "Weighs and records the harvest",
  },
  {
    key: "coop-manager",
    phone: "+23276000002",
    role: "COOP_ADMIN",
    name: "Co-op manager",
    description: "Approves payments",
  },
  {
    key: "farmer",
    phone: "+23277100001",
    role: "FARMER",
    name: "Aminata Sesay",
    description: "Rice farmer, Bombali · PIN 2580",
  },
  {
    key: "lender",
    phone: "+23276000030",
    role: "LENDER_ADMIN",
    name: "Rokel Community Bank",
    description: "Approves input loans",
  },
  {
    key: "dealer",
    phone: "+23276000040",
    role: "AGRO_DEALER",
    name: "Makeni Agro Inputs",
    description: "Redeems vouchers",
  },
];

export const DEMO_FARMER_PIN = "2580";
export const personaByKey = (key: string) => PERSONAS.find((p) => p.key === key) ?? null;
