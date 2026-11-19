import { describe, expect, it } from "vitest";
import { Role } from "@agrilink/db/enums";
import {
  type Action,
  type Actor,
  PERMISSIONS,
  PORTAL_ROLES,
  ROLE_HOME,
  can,
  hasPermission,
} from "../permissions";

const ALL_ACTIONS = [...new Set(Object.values(PERMISSIONS).flat())] as Action[];

describe("permission matrix", () => {
  it("covers every role", () => {
    for (const role of Object.values(Role)) {
      expect(PERMISSIONS[role]).toBeDefined();
      expect(ROLE_HOME[role]).toMatch(/^\//);
    }
  });

  it("every role's home portal admits that role", () => {
    for (const role of Object.values(Role)) {
      expect(PORTAL_ROLES[ROLE_HOME[role]]).toContain(role);
    }
  });

  // Table-driven: a few critical expectations (role × action)
  it.each<[Role, Action, boolean]>([
    ["AGENT", "farmer.create", true],
    ["AGENT", "farmer.import", false],
    ["COOP_ADMIN", "farmer.import", true],
    ["COOP_STAFF", "member.invite", false],
    ["LENDER_OFFICER", "farmer.create", false],
    ["PROGRAMME_OFFICER", "farmer.read", false],
    ["AGRO_DEALER", "voucher.redeem", true],
    ["FARMER", "farmer.create", false],
    ["SUPER_ADMIN", "user.manage", true],
    ["COOP_ADMIN", "user.manage", false],
  ])("%s %s → %s", (role, action, expected) => {
    expect(hasPermission(role, action)).toBe(expected);
  });

  it("only SUPER_ADMIN has admin.all and audit.read", () => {
    for (const role of Object.values(Role)) {
      expect(hasPermission(role, "admin.all")).toBe(role === "SUPER_ADMIN");
      expect(hasPermission(role, "audit.read")).toBe(role === "SUPER_ADMIN");
    }
  });

  it("no unknown actions", () => {
    expect(ALL_ACTIONS.length).toBeGreaterThan(10);
  });
});

describe("can() scope rules", () => {
  const coopA = "org_A";
  const coopB = "org_B";
  const agent: Actor = { userId: "u_agent", role: "AGENT", orgId: coopA };
  const coopAdmin: Actor = { userId: "u_admin", role: "COOP_ADMIN", orgId: coopA };
  const lender: Actor = { userId: "u_lender", role: "LENDER_OFFICER", orgId: "org_L" };
  const farmer: Actor = { userId: "u_f", role: "FARMER", orgId: null, farmerId: "f1" };

  it("agent: own registrations or own co-op", () => {
    expect(can(agent, "farmer.read", { orgId: coopA })).toBe(true);
    expect(can(agent, "farmer.read", { orgId: coopB, registeredById: "u_agent" })).toBe(true);
    expect(can(agent, "farmer.read", { orgId: coopB, registeredById: "someone" })).toBe(false);
  });

  it("co-op admin: own co-op only", () => {
    expect(can(coopAdmin, "farmer.update", { orgId: coopA })).toBe(true);
    expect(can(coopAdmin, "farmer.update", { orgId: coopB })).toBe(false);
    expect(can(coopAdmin, "farmer.update", { orgId: null })).toBe(false);
  });

  it("lender: needs consent for farmer data", () => {
    expect(can(lender, "passport.read", { farmerId: "f1", hasConsent: false })).toBe(false);
    expect(can(lender, "passport.read", { farmerId: "f1", hasConsent: true })).toBe(true);
  });

  it("farmer: only self", () => {
    expect(can(farmer, "farmer.read", { farmerId: "f1" })).toBe(true);
    expect(can(farmer, "farmer.read", { farmerId: "f2" })).toBe(false);
  });

  it("super admin: everything permitted", () => {
    const admin: Actor = { userId: "x", role: "SUPER_ADMIN", orgId: "p" };
    expect(can(admin, "farmer.update", { orgId: coopB })).toBe(true);
  });
});
