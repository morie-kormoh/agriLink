import type { Role } from "@agrilink/db/enums";

/**
 * AgriLink permission model.
 * 1) Role → allowed actions (this matrix).
 * 2) Resource scope (org / ownership / consent) checked by `can()` with the context the caller supplies.
 * Shared by the web app, USSD service and worker.
 */
export type Action =
  | "farmer.create"
  | "farmer.read"
  | "farmer.update"
  | "farmer.import"
  | "farmer.resolveDuplicate"
  | "wallet.manage"
  | "member.invite"
  | "member.manage"
  | "user.manage"
  | "purchase.create"
  | "purchase.read"
  | "price.manage"
  | "tradeSettings.manage"
  | "dispute.resolve"
  | "payment.approve"
  | "payment.read"
  | "payment.admin"
  | "record.create"
  | "record.read"
  | "season.close"
  | "savings.read"
  | "savings.configure"
  | "savingsProduct.manage"
  | "group.manage"
  | "passport.read"
  | "consent.manage"
  | "consent.request"
  | "loanProduct.manage"
  | "loan.read"
  | "loan.offer"
  | "loan.approve"
  | "loan.apply"
  | "institution.manage"
  | "dealer.manage"
  | "voucher.redeem"
  | "analytics.read"
  | "audit.read"
  | "admin.all";

export interface Actor {
  userId: string;
  role: Role;
  /** Active organisation (null for farmers acting for themselves). */
  orgId: string | null;
  /** Set when the actor is a farmer. */
  farmerId?: string | null;
}

export const PERMISSIONS: Record<Role, readonly Action[]> = {
  FARMER: [
    "farmer.read",
    "farmer.update",
    "wallet.manage",
    "savings.read",
    "savings.configure",
    "passport.read",
    "consent.manage",
    "purchase.read",
    "payment.read",
    "record.create",
    "record.read",
    "loan.read",
    "loan.apply",
  ],
  // Agents can help a farmer open savings, but every such action is confirmed with the farmer's own PIN.
  AGENT: [
    "farmer.create",
    "farmer.read",
    "farmer.update",
    "wallet.manage",
    "purchase.create",
    "purchase.read",
    "record.create",
    "record.read",
    "savings.read",
    "savings.configure",
  ],
  COOP_ADMIN: [
    "farmer.create",
    "farmer.read",
    "farmer.update",
    "farmer.import",
    "farmer.resolveDuplicate",
    "wallet.manage",
    "member.invite",
    "member.manage",
    "purchase.create",
    "purchase.read",
    "price.manage",
    "tradeSettings.manage",
    "dispute.resolve",
    "payment.approve",
    "payment.read",
    "record.create",
    "record.read",
    "season.close",
    "savings.read",
    "savings.configure",
    "group.manage",
    "analytics.read",
  ],
  COOP_STAFF: [
    "farmer.create",
    "farmer.read",
    "farmer.update",
    "wallet.manage",
    "purchase.create",
    "purchase.read",
    "payment.read",
    "record.create",
    "record.read",
    "savings.read",
    "savings.configure",
  ],
  BUYER_ADMIN: [
    "member.invite",
    "member.manage",
    "purchase.create",
    "purchase.read",
    "price.manage",
    "tradeSettings.manage",
    "dispute.resolve",
    "payment.approve",
    "payment.read",
    "analytics.read",
  ],
  BUYER_STAFF: ["purchase.create", "purchase.read", "payment.read"],
  LENDER_ADMIN: [
    "member.invite",
    "member.manage",
    "passport.read",
    "consent.request",
    "loanProduct.manage",
    "loan.read",
    "loan.offer",
    "loan.approve",
    "savings.read",
    "savingsProduct.manage",
    "institution.manage",
    "analytics.read",
  ],
  LENDER_OFFICER: [
    "passport.read",
    "consent.request",
    "loan.read",
    "loan.offer",
    "loan.approve",
    "savings.read",
  ],
  AGRO_DEALER: ["voucher.redeem", "dealer.manage"],
  PROGRAMME_OFFICER: ["analytics.read"],
  SUPER_ADMIN: [
    "farmer.create",
    "farmer.read",
    "farmer.update",
    "farmer.import",
    "farmer.resolveDuplicate",
    "wallet.manage",
    "member.invite",
    "member.manage",
    "user.manage",
    "analytics.read",
    "audit.read",
    "admin.all",
    "purchase.read",
    "payment.read",
    "payment.admin",
    "record.read",
    "savings.read",
    "savingsProduct.manage",
    "loan.read",
    "dealer.manage",
  ],
};

export function hasPermission(role: Role, action: Action): boolean {
  return PERMISSIONS[role].includes(action);
}

/** Facts about the resource the caller already loaded; `can()` never touches the DB. */
export interface ResourceContext {
  /** Organisation that owns the resource (e.g. farmer's cooperative). */
  orgId?: string | null;
  /** Farmer the resource belongs to. */
  farmerId?: string | null;
  /** User who registered the farmer (agent ownership). */
  registeredById?: string | null;
  /** Lender consent present for this farmer (module 07). */
  hasConsent?: boolean;
}

export function can(actor: Actor, action: Action, resource?: ResourceContext): boolean {
  if (!hasPermission(actor.role, action)) return false;
  if (actor.role === "SUPER_ADMIN") return true;
  if (!resource) return true; // role-level check only (e.g. "can open this page")

  switch (actor.role) {
    case "FARMER":
      return !!actor.farmerId && resource.farmerId === actor.farmerId;
    case "AGENT":
      // Own registrations, or farmers in the co-op the agent works for.
      return (
        (!!resource.registeredById && resource.registeredById === actor.userId) ||
        (!!actor.orgId && resource.orgId === actor.orgId)
      );
    case "COOP_ADMIN":
    case "COOP_STAFF":
    case "BUYER_ADMIN":
    case "BUYER_STAFF":
    case "AGRO_DEALER":
      return !!actor.orgId && resource.orgId === actor.orgId;
    case "LENDER_ADMIN":
    case "LENDER_OFFICER":
      // Lenders see farmer data only with consent; their own org resources otherwise.
      if (resource.farmerId) return resource.hasConsent === true;
      return !!actor.orgId && resource.orgId === actor.orgId;
    case "PROGRAMME_OFFICER":
      // Aggregates only — never individual farmer records without consent.
      if (resource.farmerId) return resource.hasConsent === true;
      return true;
    default:
      return false;
  }
}

/** Which portal (URL prefix) a role lands in. */
export const ROLE_HOME: Record<Role, string> = {
  FARMER: "/farmer",
  AGENT: "/agent",
  COOP_ADMIN: "/coop",
  COOP_STAFF: "/coop",
  BUYER_ADMIN: "/buyer",
  BUYER_STAFF: "/buyer",
  LENDER_ADMIN: "/lender",
  LENDER_OFFICER: "/lender",
  AGRO_DEALER: "/dealer",
  PROGRAMME_OFFICER: "/programme",
  SUPER_ADMIN: "/admin",
};

/** Roles allowed in each portal prefix. */
export const PORTAL_ROLES: Record<string, readonly Role[]> = {
  "/farmer": ["FARMER"],
  "/agent": ["AGENT", "SUPER_ADMIN"],
  "/coop": ["COOP_ADMIN", "COOP_STAFF", "SUPER_ADMIN"],
  "/buyer": ["BUYER_ADMIN", "BUYER_STAFF", "SUPER_ADMIN"],
  "/lender": ["LENDER_ADMIN", "LENDER_OFFICER", "SUPER_ADMIN"],
  "/dealer": ["AGRO_DEALER", "SUPER_ADMIN"],
  "/programme": ["PROGRAMME_OFFICER", "SUPER_ADMIN"],
  "/admin": ["SUPER_ADMIN"],
};

/** Roles an org admin may invite into their own organisation. */
export const INVITABLE_ROLES: Partial<Record<Role, readonly Role[]>> = {
  COOP_ADMIN: ["COOP_ADMIN", "COOP_STAFF", "AGENT"],
  BUYER_ADMIN: ["BUYER_ADMIN", "BUYER_STAFF"],
  LENDER_ADMIN: ["LENDER_ADMIN", "LENDER_OFFICER"],
  SUPER_ADMIN: [
    "SUPER_ADMIN",
    "COOP_ADMIN",
    "COOP_STAFF",
    "AGENT",
    "BUYER_ADMIN",
    "BUYER_STAFF",
    "LENDER_ADMIN",
    "LENDER_OFFICER",
    "AGRO_DEALER",
    "PROGRAMME_OFFICER",
  ],
};

/** Roles that require a session inactivity timeout (sensitive portals). */
export const SHORT_SESSION_ROLES: readonly Role[] = [
  "SUPER_ADMIN",
  "LENDER_ADMIN",
  "LENDER_OFFICER",
];
