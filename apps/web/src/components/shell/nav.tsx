import { getTranslations } from "next-intl/server";
import {
  BanknoteIcon,
  BookOpenTextIcon,
  CalendarRangeIcon,
  CoinsIcon,
  NotebookPenIcon,
  PackageIcon,
  ScaleIcon,
  Settings2Icon,
  ShieldAlertIcon,
  StoreIcon,
  TagIcon,
  CopyIcon,
  FileUpIcon,
  IdCardIcon,
  LayoutDashboardIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  UsersIcon,
  Building2Icon,
  UserCogIcon,
  PiggyBankIcon,
  GaugeIcon,
  HandCoinsIcon,
  InboxIcon,
  PackageSearchIcon,
  ShieldCheckIcon as ConsentIcon,
  TicketIcon,
  StoreIcon as ShopIcon,
  LandmarkIcon,
  ReceiptIcon,
  UsersRoundIcon,
} from "lucide-react";
import type { Role } from "@agripay/db/enums";
import { ROLE_HOME } from "@agripay/validation/permissions";
import type { NavItem } from "./mobile-nav";

/** Navigation per role (portal). */
export async function navFor(role: Role): Promise<{ title: string; items: NavItem[] }> {
  const t = await getTranslations();
  const title = t(`roles.${role}`);
  switch (role) {
    case "AGENT":
      return {
        title,
        items: [
          { href: "/agent", label: t("nav.dashboard"), icon: <LayoutDashboardIcon />, exact: true },
          { href: "/agent/farmers/new", label: t("nav.registerFarmer"), icon: <UserPlusIcon /> },
          { href: "/agent/farmers", label: t("nav.farmers"), icon: <UsersIcon />, exact: true },
          { href: "/agent/sync", label: t("nav.sync"), icon: <RefreshCwIcon /> },
        ],
      };
    case "COOP_ADMIN":
    case "COOP_STAFF": {
      const admin = role === "COOP_ADMIN";
      return {
        title,
        items: [
          { href: "/coop", label: t("nav.dashboard"), icon: <LayoutDashboardIcon />, exact: true },
          { href: "/coop/members", label: t("nav.members"), icon: <UsersIcon />, exact: true },
          { href: "/coop/members/new", label: t("nav.registerFarmer"), icon: <UserPlusIcon /> },
          { href: "/coop/collections/new", label: t("nav.recordPurchase"), icon: <ScaleIcon /> },
          {
            href: "/coop/collections",
            label: t("nav.collections"),
            icon: <PackageIcon />,
            exact: true,
          },
          { href: "/coop/payments", label: t("nav.payments"), icon: <BanknoteIcon /> },
          { href: "/coop/seasons", label: t("nav.seasons"), icon: <CalendarRangeIcon /> },
          { href: "/coop/groups", label: t("nav.groups"), icon: <UsersRoundIcon /> },
          ...(admin
            ? [
                { href: "/coop/disputes", label: t("nav.disputes"), icon: <ShieldAlertIcon /> },
                { href: "/coop/prices", label: t("nav.prices"), icon: <TagIcon /> },
                { href: "/coop/members/import", label: t("nav.import"), icon: <FileUpIcon /> },
                {
                  href: "/coop/members/duplicates",
                  label: t("nav.duplicates"),
                  icon: <CopyIcon />,
                },
                { href: "/coop/settings", label: t("nav.tradeSettings"), icon: <Settings2Icon /> },
                { href: "/settings/team", label: t("nav.team"), icon: <UserCogIcon /> },
              ]
            : [{ href: "/coop/prices", label: t("nav.prices"), icon: <TagIcon /> }]),
        ],
      };
    }
    case "SUPER_ADMIN":
      return {
        title,
        items: [
          { href: "/admin", label: t("nav.dashboard"), icon: <LayoutDashboardIcon />, exact: true },
          { href: "/admin/farmers", label: t("nav.farmers"), icon: <UsersIcon /> },
          { href: "/admin/users", label: t("nav.users"), icon: <UserCogIcon /> },
          { href: "/admin/organizations", label: t("nav.organizations"), icon: <Building2Icon /> },
          { href: "/admin/payments", label: t("nav.payments"), icon: <BanknoteIcon /> },
          { href: "/admin/reconciliation", label: t("nav.reconciliation"), icon: <CoinsIcon /> },
          { href: "/admin/dealers", label: t("nav.dealers"), icon: <ShopIcon /> },
          { href: "/admin/audit", label: t("nav.audit"), icon: <ScrollTextIcon /> },
          { href: "/api/v1/docs", label: t("nav.apiDocs"), icon: <BookOpenTextIcon /> },
        ],
      };
    case "FARMER":
      return {
        title,
        items: [
          { href: "/farmer", label: t("nav.myProfile"), icon: <IdCardIcon />, exact: true },
          { href: "/farmer/sales", label: t("nav.sales"), icon: <StoreIcon /> },
          { href: "/farmer/payments", label: t("nav.statement"), icon: <BanknoteIcon /> },
          { href: "/farmer/records", label: t("nav.records"), icon: <NotebookPenIcon /> },
          { href: "/farmer/savings", label: t("nav.savings"), icon: <PiggyBankIcon /> },
          { href: "/farmer/passport", label: t("nav.passport"), icon: <GaugeIcon /> },
          { href: "/farmer/loans", label: t("nav.loans"), icon: <HandCoinsIcon /> },
          { href: "/settings/security", label: t("nav.security"), icon: <ShieldCheckIcon /> },
        ],
      };
    case "BUYER_ADMIN":
    case "BUYER_STAFF": {
      const admin = role === "BUYER_ADMIN";
      return {
        title,
        items: [
          { href: "/buyer", label: t("nav.dashboard"), icon: <LayoutDashboardIcon />, exact: true },
          { href: "/buyer/collections/new", label: t("nav.recordPurchase"), icon: <ScaleIcon /> },
          {
            href: "/buyer/collections",
            label: t("nav.collections"),
            icon: <PackageIcon />,
            exact: true,
          },
          { href: "/buyer/payments", label: t("nav.payments"), icon: <BanknoteIcon /> },
          { href: "/buyer/suppliers", label: t("nav.suppliers"), icon: <UsersIcon /> },
          { href: "/buyer/prices", label: t("nav.prices"), icon: <TagIcon /> },
          ...(admin
            ? [
                { href: "/buyer/disputes", label: t("nav.disputes"), icon: <ShieldAlertIcon /> },
                { href: "/buyer/settings", label: t("nav.tradeSettings"), icon: <Settings2Icon /> },
                { href: "/settings/team", label: t("nav.team"), icon: <UserCogIcon /> },
              ]
            : []),
        ],
      };
    }
    case "LENDER_ADMIN":
    case "LENDER_OFFICER": {
      const admin = role === "LENDER_ADMIN";
      return {
        title,
        items: [
          {
            href: "/lender",
            label: t("nav.portfolio"),
            icon: <LayoutDashboardIcon />,
            exact: true,
          },
          { href: "/lender/applications", label: t("nav.applications"), icon: <InboxIcon /> },
          { href: "/lender/loans", label: t("nav.allLoans"), icon: <HandCoinsIcon /> },
          { href: "/lender/farmers", label: t("nav.lenderFarmers"), icon: <UsersIcon /> },
          { href: "/lender/consents", label: t("nav.consents"), icon: <ConsentIcon /> },
          { href: "/lender/products", label: t("nav.products"), icon: <PackageSearchIcon /> },
          { href: "/lender/savings", label: t("nav.custodian"), icon: <PiggyBankIcon /> },
          ...(admin
            ? [
                { href: "/lender/settings", label: t("nav.institution"), icon: <LandmarkIcon /> },
                { href: "/settings/team", label: t("nav.team"), icon: <UserCogIcon /> },
              ]
            : []),
        ],
      };
    }
    case "AGRO_DEALER":
      return {
        title,
        items: [
          {
            href: "/dealer",
            label: t("nav.dashboard"),
            icon: <LayoutDashboardIcon />,
            exact: true,
          },
          { href: "/dealer/redeem", label: t("nav.redeem"), icon: <TicketIcon /> },
          { href: "/dealer/catalogue", label: t("nav.catalogue"), icon: <PackageIcon /> },
          { href: "/dealer/settlements", label: t("nav.settlements"), icon: <ReceiptIcon /> },
          { href: "/dealer/profile", label: t("nav.shopProfile"), icon: <ShopIcon /> },
        ],
      };
    default: {
      const home = ROLE_HOME[role];
      return {
        title,
        items: [
          { href: home, label: t("nav.dashboard"), icon: <LayoutDashboardIcon />, exact: true },
        ],
      };
    }
  }
}
