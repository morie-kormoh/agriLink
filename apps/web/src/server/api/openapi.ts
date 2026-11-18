import "server-only";
import { z } from "zod";
import {
  acknowledgeSchema,
  addRecordSchema,
  buyerSettingsSchema,
  cancelPurchaseSchema,
  closeSeasonSchema,
  collectionPointSchema,
  coopSettingsSchema,
  farmerSearchSchema,
  listPurchasesSchema,
  otpRequestSchema,
  otpVerifySchema,
  previewWaterfallSchema,
  recordPurchaseSchema,
  registerFarmerSchema,
  resolveDisputeSchema,
  selectContextSchema,
  setPinSchema,
  setPriceSchema,
  updateFarmerSchema,
  updateRecordSchema,
  acceptLoanSchema,
  addGroupMemberSchema,
  applyLoanSchema,
  createGroupSchema,
  dealerItemSchema,
  dealerProfileSchema,
  declineLoanSchema,
  earlyWithdrawalSchema,
  institutionSettingsSchema,
  loanProductSchema,
  makeOfferSchema,
  manualRepaymentSchema,
  markDefaultSchema,
  openGoalSchema,
  openHarvestLockSchema,
  recordContributionSchema,
  recordPayoutSchema,
  redeemVoucherSchema,
  redemptionItemsSchema,
  requestConsentSchema,
  respondConsentSchema,
  restructureSchema,
  revokeConsentSchema,
  updateAutoSaveSchema,
} from "@agripay/validation";

/**
 * OpenAPI 3.1 description of /api/v1, generated from the same Zod schemas the server validates with.
 * Served at /api/v1/openapi.json, rendered at /api/v1/docs. Use it to generate the mobile app's typed client.
 */
type Method = "get" | "post" | "put" | "patch" | "delete";
interface Endpoint {
  method: Method;
  path: string;
  tag: string;
  summary: string;
  description?: string;
  body?: z.ZodType;
  query?: z.ZodObject;
  public?: boolean;
  roles?: string;
  status?: number;
}

const id = { in: "path", name: "id", required: true, schema: { type: "string" } };

const ENDPOINTS: Endpoint[] = [
  // Auth
  {
    method: "post",
    path: "/auth/otp/request",
    tag: "Auth",
    summary: "Send a 6-digit sign-in code by SMS",
    body: otpRequestSchema,
    public: true,
  },
  {
    method: "post",
    path: "/auth/otp/verify",
    tag: "Auth",
    summary: "Exchange the code for access + refresh tokens",
    body: otpVerifySchema.extend({ deviceName: z.string().optional() }),
    public: true,
  },
  {
    method: "post",
    path: "/auth/refresh",
    tag: "Auth",
    summary: "Rotate tokens (old refresh token stops working)",
    body: z.object({ refreshToken: z.string() }),
    public: true,
  },
  { method: "post", path: "/auth/logout", tag: "Auth", summary: "Revoke this device's session" },
  {
    method: "get",
    path: "/me",
    tag: "Auth",
    summary: "Current user, workspaces and active workspace",
  },
  {
    method: "post",
    path: "/me/context",
    tag: "Auth",
    summary: "Choose the active workspace (organisation + role)",
    body: selectContextSchema,
  },
  {
    method: "post",
    path: "/me/pin",
    tag: "Auth",
    summary: "Set or change the transaction PIN",
    body: setPinSchema,
  },
  {
    method: "get",
    path: "/reference",
    tag: "Reference",
    summary: "Districts, chiefdoms, crops and your cooperatives (cache offline)",
  },
  // Farmers
  {
    method: "get",
    path: "/farmers",
    tag: "Farmers",
    summary: "Search farmers in your scope",
    query: farmerSearchSchema,
  },
  {
    method: "post",
    path: "/farmers",
    tag: "Farmers",
    summary: "Register a farmer (send clientRef for idempotency)",
    body: registerFarmerSchema,
    status: 201,
    roles: "AGENT, COOP_ADMIN, COOP_STAFF, SUPER_ADMIN",
  },
  {
    method: "post",
    path: "/farmers/sync",
    tag: "Farmers",
    summary: "Batch upsert offline registrations (max 25)",
    body: z.object({ records: z.array(registerFarmerSchema).max(25) }),
  },
  {
    method: "get",
    path: "/farmers/{id}",
    tag: "Farmers",
    summary: "Farmer profile with wallets and plots",
  },
  {
    method: "patch",
    path: "/farmers/{id}",
    tag: "Farmers",
    summary: "Update a farmer",
    body: updateFarmerSchema,
  },
  {
    method: "get",
    path: "/farmers/{id}/statement",
    tag: "Payments",
    summary: "Payments received and wallet ledger",
  },
  // Records
  {
    method: "get",
    path: "/farmers/{id}/records",
    tag: "Farm records",
    summary: "Farm records (filter ?season=2027-MAIN)",
  },
  {
    method: "post",
    path: "/farmers/{id}/records",
    tag: "Farm records",
    summary: "Add a farm record",
    body: addRecordSchema,
    status: 201,
  },
  {
    method: "get",
    path: "/farmers/{id}/season-summary",
    tag: "Farm records",
    summary: "Spent / sold / net for a season (?season=)",
  },
  {
    method: "patch",
    path: "/records/{id}",
    tag: "Farm records",
    summary: "Edit your own manual record (30 days)",
    body: updateRecordSchema,
  },
  {
    method: "delete",
    path: "/records/{id}",
    tag: "Farm records",
    summary: "Delete your own manual record (30 days)",
  },
  {
    method: "post",
    path: "/seasons/close",
    tag: "Farm records",
    summary: "Close a season for the co-op: summaries + SMS",
    body: closeSeasonSchema,
    roles: "COOP_ADMIN",
  },
  // Trade
  {
    method: "get",
    path: "/trade/farmers",
    tag: "Purchases",
    summary: "Find a farmer to buy from (?q=)",
  },
  {
    method: "get",
    path: "/trade/settings",
    tag: "Purchases",
    summary: "Co-op / buyer trade settings",
  },
  {
    method: "put",
    path: "/trade/settings",
    tag: "Purchases",
    summary: "Update trade settings (co-op or buyer shape)",
    body: z.union([coopSettingsSchema, buyerSettingsSchema]),
  },
  { method: "get", path: "/trade/prices", tag: "Purchases", summary: "Active price list" },
  {
    method: "post",
    path: "/trade/prices",
    tag: "Purchases",
    summary: "Set a price",
    body: setPriceSchema,
    status: 201,
  },
  {
    method: "get",
    path: "/trade/collection-points",
    tag: "Purchases",
    summary: "Collection points",
  },
  {
    method: "post",
    path: "/trade/collection-points",
    tag: "Purchases",
    summary: "Add a collection point",
    body: collectionPointSchema,
    status: 201,
  },
  {
    method: "get",
    path: "/purchases",
    tag: "Purchases",
    summary: "List purchases",
    query: listPurchasesSchema,
  },
  {
    method: "post",
    path: "/purchases",
    tag: "Purchases",
    summary: "Record a weighed purchase (amounts computed by the server)",
    body: recordPurchaseSchema,
    status: 201,
  },
  {
    method: "get",
    path: "/purchases/{id}",
    tag: "Purchases",
    summary: "Purchase with payment and splits",
  },
  {
    method: "post",
    path: "/purchases/{id}/cancel",
    tag: "Purchases",
    summary: "Cancel an unpaid purchase",
    body: cancelPurchaseSchema,
  },
  {
    method: "post",
    path: "/purchases/{id}/approve",
    tag: "Purchases",
    summary: "Approve & pay one purchase (second person)",
  },
  {
    method: "post",
    path: "/purchases/{id}/resolve-dispute",
    tag: "Purchases",
    summary: "Resolve a farmer dispute",
    body: resolveDisputeSchema,
  },
  {
    method: "post",
    path: "/purchases/acknowledge",
    tag: "Purchases",
    summary: "Farmer confirms (1) or disputes (2) a purchase",
    body: acknowledgeSchema,
    roles: "FARMER",
  },
  { method: "get", path: "/batches", tag: "Purchases", summary: "Purchase batches (?status=)" },
  {
    method: "get",
    path: "/batches/{id}",
    tag: "Purchases",
    summary: "Batch with purchases and payments",
  },
  {
    method: "post",
    path: "/batches/{id}/submit",
    tag: "Purchases",
    summary: "Submit a batch for approval",
  },
  {
    method: "post",
    path: "/batches/{id}/approve",
    tag: "Purchases",
    summary: "Approve & pay a batch (maker–checker)",
  },
  // Payments
  { method: "get", path: "/payments", tag: "Payments", summary: "Payments (?status&page)" },
  {
    method: "get",
    path: "/payments/{id}",
    tag: "Payments",
    summary: "Payment with splits and provider instructions",
  },
  {
    method: "post",
    path: "/payments/preview",
    tag: "Payments",
    summary: "Preview the Smart Split waterfall",
    body: previewWaterfallSchema,
  },
  // Savings (module 06)
  {
    method: "get",
    path: "/savings/products",
    tag: "Savings",
    summary: "Active savings products (Harvest Lock, goals)",
  },
  {
    method: "get",
    path: "/farmers/{id}/savings",
    tag: "Savings",
    summary: "A farmer's savings accounts, transactions, products and groups",
  },
  {
    method: "post",
    path: "/farmers/{id}/savings/harvest-lock",
    tag: "Savings",
    summary: "Open Harvest Lock (farmer's PIN required, also when an agent helps)",
    body: openHarvestLockSchema,
    status: 201,
  },
  {
    method: "post",
    path: "/farmers/{id}/savings/goals",
    tag: "Savings",
    summary: "Open a savings goal (farmer's PIN)",
    body: openGoalSchema,
    status: 201,
  },
  {
    method: "post",
    path: "/savings/{id}/auto-save",
    tag: "Savings",
    summary: "Change % or pause/resume auto-save (PIN)",
    body: updateAutoSaveSchema,
  },
  {
    method: "get",
    path: "/savings/{id}/early-withdrawal",
    tag: "Savings",
    summary: "Preview the early-withdrawal fee (?amountLe=)",
  },
  {
    method: "post",
    path: "/savings/{id}/early-withdrawal",
    tag: "Savings",
    summary: "Emergency withdrawal, once per season (PIN)",
    body: earlyWithdrawalSchema,
  },
  {
    method: "get",
    path: "/groups",
    tag: "Savings groups",
    summary: "VSLA / Osusu groups in scope",
  },
  {
    method: "post",
    path: "/groups",
    tag: "Savings groups",
    summary: "Create a group",
    body: createGroupSchema,
    status: 201,
    roles: "COOP_ADMIN",
  },
  {
    method: "get",
    path: "/groups/{id}",
    tag: "Savings groups",
    summary: "Members, contributions per period, payouts, next recipient",
  },
  {
    method: "post",
    path: "/groups/{id}/members",
    tag: "Savings groups",
    summary: "Add or update a member",
    body: addGroupMemberSchema,
    roles: "COOP_ADMIN",
  },
  {
    method: "post",
    path: "/groups/{id}/contributions",
    tag: "Savings groups",
    summary: "Record a contribution (co-op staff or treasurer)",
    body: recordContributionSchema,
  },
  {
    method: "post",
    path: "/groups/{id}/payouts",
    tag: "Savings groups",
    summary: "Pay the Osusu pot for a period",
    body: recordPayoutSchema,
  },
  {
    method: "post",
    path: "/groups/{id}/statements",
    tag: "Savings groups",
    summary: "SMS every member their total",
  },
  // Passport & consent (module 07)
  {
    method: "get",
    path: "/passport",
    tag: "Passport",
    summary: "My score, factors & tips, history, requests, who can see it, who looked",
    roles: "FARMER",
  },
  {
    method: "get",
    path: "/consents",
    tag: "Passport",
    summary: "My consent requests and permissions",
    roles: "FARMER",
  },
  {
    method: "post",
    path: "/consents",
    tag: "Passport",
    summary: "Ask a farmer (AgriPay ID or phone) for consent",
    body: requestConsentSchema,
    status: 201,
    roles: "LENDER_ADMIN, LENDER_OFFICER",
  },
  {
    method: "post",
    path: "/consents/{id}/respond",
    tag: "Passport",
    summary: "Grant or decline with PIN",
    body: respondConsentSchema,
  },
  {
    method: "post",
    path: "/consents/{id}/revoke",
    tag: "Passport",
    summary: "Stop a lender's access (PIN)",
    body: revokeConsentSchema,
  },
  {
    method: "get",
    path: "/lender/consents",
    tag: "Lender",
    summary: "Consent requests sent (?status=)",
    roles: "LENDER_ADMIN, LENDER_OFFICER",
  },
  {
    method: "get",
    path: "/lender/farmers",
    tag: "Lender",
    summary: "Farmers who allow access (?productId for eligible + anonymised count)",
    roles: "LENDER_ADMIN, LENDER_OFFICER",
  },
  {
    method: "get",
    path: "/lender/farmers/{id}/passport",
    tag: "Lender",
    summary: "Passport view — 403 without consent; logged",
    roles: "LENDER_ADMIN, LENDER_OFFICER",
  },
  {
    method: "get",
    path: "/lender/portfolio",
    tag: "Lender",
    summary: "Disbursed, outstanding, PAR30/90, repayment rate, disaggregated",
    roles: "LENDER_ADMIN, LENDER_OFFICER",
  },
  {
    method: "get",
    path: "/lender/institution",
    tag: "Lender",
    summary: "Institution accounts and approval limit",
  },
  {
    method: "put",
    path: "/lender/institution",
    tag: "Lender",
    summary: "Update institution settings",
    body: institutionSettingsSchema,
    roles: "LENDER_ADMIN",
  },
  // Credit (module 08)
  { method: "get", path: "/loan-products", tag: "Credit", summary: "Loan products" },
  {
    method: "post",
    path: "/loan-products",
    tag: "Credit",
    summary: "Create a loan product",
    body: loanProductSchema,
    status: 201,
    roles: "LENDER_ADMIN",
  },
  { method: "get", path: "/loan-products/{id}", tag: "Credit", summary: "Loan product" },
  {
    method: "put",
    path: "/loan-products/{id}",
    tag: "Credit",
    summary: "Update a loan product",
    body: loanProductSchema,
    roles: "LENDER_ADMIN",
  },
  {
    method: "get",
    path: "/loan-products/{id}/eligibility",
    tag: "Credit",
    summary: "Am I eligible? limit, reasons, affordability",
    roles: "FARMER",
  },
  {
    method: "get",
    path: "/loan-products/{id}/disclosure",
    tag: "Credit",
    summary: "Plain-language terms (?amountLe=&lang=en|kri)",
  },
  {
    method: "get",
    path: "/loans",
    tag: "Credit",
    summary: "Farmer: overview. Lender: loans (?queue=1, ?status=, ?page=)",
  },
  {
    method: "post",
    path: "/loans",
    tag: "Credit",
    summary: "Farmer applies (PIN) / lender makes an offer",
    body: z.union([applyLoanSchema, makeOfferSchema]),
    status: 201,
  },
  {
    method: "get",
    path: "/loans/{id}",
    tag: "Credit",
    summary: "Loan with voucher, repayments and timeline",
  },
  {
    method: "post",
    path: "/loans/{id}/accept",
    tag: "Credit",
    summary: "Farmer accepts an offer (PIN)",
    body: acceptLoanSchema,
    roles: "FARMER",
  },
  {
    method: "post",
    path: "/loans/{id}/cancel",
    tag: "Credit",
    summary: "Farmer cancels (before approval, or 24 h cooling-off if unused)",
    body: acceptLoanSchema,
    roles: "FARMER",
  },
  {
    method: "post",
    path: "/loans/{id}/accept-restructure",
    tag: "Credit",
    summary: "Farmer accepts a new due date (PIN)",
    body: acceptLoanSchema,
    roles: "FARMER",
  },
  {
    method: "post",
    path: "/loans/{id}/approve",
    tag: "Credit",
    summary: "Approve → voucher issued (maker–checker, threshold)",
    roles: "LENDER_ADMIN, LENDER_OFFICER",
  },
  {
    method: "post",
    path: "/loans/{id}/decline",
    tag: "Credit",
    summary: "Decline",
    body: declineLoanSchema,
    roles: "LENDER_ADMIN, LENDER_OFFICER",
  },
  {
    method: "post",
    path: "/loans/{id}/repayments",
    tag: "Credit",
    summary: "Record a mobile money repayment",
    body: manualRepaymentSchema,
    roles: "LENDER_ADMIN, LENDER_OFFICER",
  },
  {
    method: "post",
    path: "/loans/{id}/restructure",
    tag: "Credit",
    summary: "Propose a new due date (farmer accepts with PIN)",
    body: restructureSchema,
    roles: "LENDER_ADMIN",
  },
  {
    method: "post",
    path: "/loans/{id}/default",
    tag: "Credit",
    summary: "Mark defaulted (> 90 days past due)",
    body: markDefaultSchema,
    roles: "LENDER_ADMIN",
  },
  // Agro-dealers
  {
    method: "get",
    path: "/vouchers/{code}",
    tag: "Agro-dealer",
    summary: "Look up a voucher at the counter",
    roles: "AGRO_DEALER",
  },
  {
    method: "post",
    path: "/vouchers/{code}/otp",
    tag: "Agro-dealer",
    summary: "SMS the farmer a confirmation code for these items",
    body: z.object({ items: redemptionItemsSchema }),
    roles: "AGRO_DEALER",
  },
  {
    method: "post",
    path: "/vouchers/{code}/redeem",
    tag: "Agro-dealer",
    summary: "Redeem with the farmer's code → same-day settlement",
    body: redeemVoucherSchema.omit({ code: true }),
    roles: "AGRO_DEALER",
  },
  {
    method: "get",
    path: "/dealer/catalogue",
    tag: "Agro-dealer",
    summary: "Catalogue (?active=1)",
    roles: "AGRO_DEALER",
  },
  {
    method: "post",
    path: "/dealer/catalogue",
    tag: "Agro-dealer",
    summary: "Add an item",
    body: dealerItemSchema,
    status: 201,
    roles: "AGRO_DEALER",
  },
  {
    method: "put",
    path: "/dealer/catalogue/{id}",
    tag: "Agro-dealer",
    summary: "Update an item",
    body: dealerItemSchema,
    roles: "AGRO_DEALER",
  },
  {
    method: "get",
    path: "/dealer/profile",
    tag: "Agro-dealer",
    summary: "Shop profile",
    roles: "AGRO_DEALER",
  },
  {
    method: "put",
    path: "/dealer/profile",
    tag: "Agro-dealer",
    summary: "Update shop profile (payout change needs re-verification)",
    body: dealerProfileSchema,
    roles: "AGRO_DEALER",
  },
  {
    method: "get",
    path: "/dealer/redemptions",
    tag: "Agro-dealer",
    summary: "Redemptions and settlement status",
    roles: "AGRO_DEALER",
  },
];

function schemaOf(s: z.ZodType) {
  return z.toJSONSchema(s, { io: "input", unrepresentable: "any", target: "draft-2020-12" });
}

export function buildOpenApi(serverUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of ENDPOINTS) {
    const params: unknown[] = [];
    for (const m of e.path.matchAll(/\{(\w+)\}/g))
      params.push(
        m[1] === "id" ? id : { in: "path", name: m[1], required: true, schema: { type: "string" } },
      );
    if (e.query) {
      for (const [name, s] of Object.entries(e.query.shape)) {
        params.push({ in: "query", name, required: false, schema: schemaOf(s as z.ZodType) });
      }
    }
    (paths[e.path] ??= {})[e.method] = {
      tags: [e.tag],
      summary: e.summary,
      description: e.roles ? `Roles: ${e.roles}` : undefined,
      security: e.public ? [] : [{ bearer: [] }],
      parameters: params.length ? params : undefined,
      requestBody: e.body
        ? { required: true, content: { "application/json": { schema: schemaOf(e.body) } } }
        : undefined,
      responses: {
        [String(e.status ?? 200)]: {
          description: "OK",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
        "409": { $ref: "#/components/responses/Error" },
        "422": { $ref: "#/components/responses/Error" },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "AgriPay Salone API",
      version: "1.0.0",
      description:
        "API for the AgriPay mobile app, USSD service and partners. Sign in with POST /auth/otp/request then /auth/otp/verify, " +
        "send `Authorization: Bearer <accessToken>` (valid 15 minutes) and refresh with /auth/refresh. " +
        "If you belong to several workspaces, choose one with POST /me/context (otherwise 409 CONTEXT_REQUIRED). " +
        "Money is a string in Leones with 2 decimals. Send a `clientRef` UUID when creating farmers or purchases offline.",
    },
    servers: [{ url: `${serverUrl}/api/v1` }],
    components: {
      securitySchemes: {
        bearer: {
          type: "http",
          scheme: "bearer",
          description: "Access token from /auth/otp/verify or /auth/refresh",
        },
      },
      schemas: {
        Envelope: { type: "object", properties: { data: {}, meta: { type: "object" } } },
        Error: {
          type: "object",
          properties: { error: { type: "string" }, code: { type: "string" } },
          required: ["error"],
        },
      },
      responses: {
        Error: {
          description: "Error",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
    },
    paths,
  };
}

export const OPENAPI_ENDPOINT_COUNT = ENDPOINTS.length;
