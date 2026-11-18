-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('APPLIED', 'OFFERED', 'ACCEPTED', 'APPROVED', 'DISBURSED', 'REPAYING', 'REPAID', 'LATE', 'DEFAULTED', 'RESTRUCTURED', 'WRITTEN_OFF', 'CANCELLED', 'DECLINED');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('ISSUED', 'PARTIALLY_REDEEMED', 'REDEEMED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScoreBand" AS ENUM ('BUILDING', 'FAIR', 'GOOD', 'STRONG');

-- CreateEnum
CREATE TYPE "ConsentScope" AS ENUM ('PASSPORT_SUMMARY', 'PASSPORT_DETAILED', 'RECORDS_FULL');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('REQUESTED', 'GRANTED', 'DECLINED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SavingsType" AS ENUM ('HARVEST_LOCK', 'GOAL', 'GROUP');

-- CreateEnum
CREATE TYPE "SavingsStatus" AS ENUM ('ACTIVE', 'LOCKED', 'RELEASED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SavingsReleaseRule" AS ENUM ('FIXED_DATE', 'SEASON_START', 'GOAL_REACHED');

-- CreateEnum
CREATE TYPE "SavingsTxnType" AS ENUM ('CREDIT_AUTO', 'CREDIT_MANUAL', 'RELEASE', 'EARLY_WITHDRAWAL', 'FEE', 'INTEREST');

-- AlterEnum
ALTER TYPE "OtpPurpose" ADD VALUE 'VOUCHER_REDEEM';

-- AlterEnum
ALTER TYPE "SplitType" ADD VALUE 'DEALER_SETTLEMENT';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "context" JSONB,
ADD COLUMN     "sourceAccountCode" TEXT;

-- CreateTable
CREATE TABLE "LoanProduct" (
    "id" TEXT NOT NULL,
    "lenderOrgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "purpose" TEXT NOT NULL,
    "cropIds" TEXT[],
    "districtIds" TEXT[],
    "minAmountLe" DECIMAL(14,2) NOT NULL,
    "maxAmountLe" DECIMAL(14,2) NOT NULL,
    "firstCycleMaxLe" DECIMAL(14,2) NOT NULL,
    "graduationPct" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "flatFeePct" DECIMAL(5,2) NOT NULL,
    "minBand" "ScoreBand" NOT NULL,
    "maxDebtToIncomePct" DECIMAL(5,2) NOT NULL,
    "repaymentMode" TEXT NOT NULL DEFAULT 'HARVEST_DEDUCTION',
    "dueMonthDay" TEXT,
    "maxRepaymentPctPerSale" DECIMAL(5,2) NOT NULL DEFAULT 60,
    "requiresGroupGuarantee" BOOLEAN NOT NULL DEFAULT false,
    "voucherOnly" BOOLEAN NOT NULL DEFAULT true,
    "voucherValidDays" INTEGER NOT NULL DEFAULT 60,
    "allowedCategories" TEXT[],
    "eligibleDealerIds" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lenderOrgId" TEXT NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'APPLIED',
    "requestedLe" DECIMAL(14,2) NOT NULL,
    "approvedLe" DECIMAL(14,2),
    "feeLe" DECIMAL(14,2),
    "totalDueLe" DECIMAL(14,2),
    "repaidLe" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "season" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "scoreAtApplication" INTEGER,
    "bandAtApplication" "ScoreBand",
    "affordability" JSONB,
    "disclosure" JSONB,
    "disclosureAcceptedAt" TIMESTAMP(3),
    "acceptedVia" TEXT,
    "appliedVia" TEXT NOT NULL,
    "offeredById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "disbursedAt" TIMESTAMP(3),
    "coolingOffUntil" TIMESTAMP(3),
    "repaidAt" TIMESTAMP(3),
    "lateAt" TIMESTAMP(3),
    "defaultedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "lastReminderAt" TIMESTAMP(3),
    "pendingRestructure" JSONB,
    "splitRuleId" TEXT,
    "consentId" TEXT,
    "groupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanRepayment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "amountLe" DECIMAL(14,2) NOT NULL,
    "source" TEXT NOT NULL,
    "paymentId" TEXT,
    "splitId" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgroDealer" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "payoutMsisdn" TEXT NOT NULL,
    "payoutProvider" "MobileMoneyProvider" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "AgroDealer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerItem" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'each',
    "unitPriceLe" DECIMAL(14,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealerItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InputVoucher" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "loanId" TEXT,
    "farmerId" TEXT NOT NULL,
    "funderOrgId" TEXT NOT NULL,
    "valueLe" DECIMAL(14,2) NOT NULL,
    "remainingLe" DECIMAL(14,2) NOT NULL,
    "allowedCategories" TEXT[],
    "allowedDealerIds" TEXT[],
    "status" "VoucherStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "InputVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherRedemption" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "amountLe" DECIMAL(14,2) NOT NULL,
    "farmerOtpVerified" BOOLEAN NOT NULL,
    "clientRef" TEXT,
    "redeemedById" TEXT NOT NULL,
    "settlementPaymentId" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoucherRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditScore" (
    "id" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "band" "ScoreBand" NOT NULL,
    "factors" JSONB NOT NULL,
    "flags" TEXT[],
    "modelVersion" TEXT NOT NULL,
    "inputsHash" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CreditScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRequest" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "requesterOrgId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "scope" "ConsentScope" NOT NULL,
    "purpose" TEXT NOT NULL,
    "durationMonths" INTEGER NOT NULL DEFAULT 12,
    "status" "ConsentStatus" NOT NULL DEFAULT 'REQUESTED',
    "expiresAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "channel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassportAccessLog" (
    "id" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "viewerUserId" TEXT NOT NULL,
    "viewerOrgId" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "scope" "ConsentScope" NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassportAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialInstitution" (
    "orgId" TEXT NOT NULL,
    "licenceNo" TEXT,
    "fundingProvider" "MobileMoneyProvider",
    "fundingAccount" TEXT,
    "collectionAccount" TEXT,
    "savingsAccount" TEXT,
    "approvalThresholdLe" DECIMAL(14,2) NOT NULL DEFAULT 5000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialInstitution_pkey" PRIMARY KEY ("orgId")
);

-- CreateTable
CREATE TABLE "SavingsProduct" (
    "id" TEXT NOT NULL,
    "custodianOrgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SavingsType" NOT NULL,
    "defaultPct" DECIMAL(5,2),
    "minPct" DECIMAL(5,2),
    "maxPct" DECIMAL(5,2),
    "releaseRule" "SavingsReleaseRule" NOT NULL,
    "releaseMonthDay" TEXT,
    "earlyWithdrawalAllowed" BOOLEAN NOT NULL DEFAULT true,
    "earlyWithdrawalFeePct" DECIMAL(5,2),
    "interestNote" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavingsProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsAccount" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "farmerId" TEXT,
    "productId" TEXT NOT NULL,
    "custodianAccountRef" TEXT,
    "status" "SavingsStatus" NOT NULL DEFAULT 'ACTIVE',
    "autoSavePct" DECIMAL(5,2),
    "autoSavePaused" BOOLEAN NOT NULL DEFAULT false,
    "goalLe" DECIMAL(14,2),
    "goalLabel" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "splitRuleId" TEXT,
    "balanceLe" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "openedVia" TEXT,
    "earlyWithdrawalSeason" TEXT,
    "releaseNoticeFor" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavingsAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "SavingsTxnType" NOT NULL,
    "amountLe" DECIMAL(14,2) NOT NULL,
    "balanceAfterLe" DECIMAL(14,2) NOT NULL,
    "paymentId" TEXT,
    "splitId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavingsTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsGroup" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cooperativeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contributionLe" DECIMAL(14,2) NOT NULL,
    "frequency" TEXT NOT NULL,
    "cycleStart" TIMESTAMP(3) NOT NULL,
    "cycleEnd" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavingsGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "payoutOrder" INTEGER,
    "guarantor" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavingsGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupContribution" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "amountLe" DECIMAL(14,2) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPayout" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "amountLe" DECIMAL(14,2) NOT NULL,
    "method" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoanProduct_lenderOrgId_active_idx" ON "LoanProduct"("lenderOrgId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_ref_key" ON "Loan"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_splitRuleId_key" ON "Loan"("splitRuleId");

-- CreateIndex
CREATE INDEX "Loan_lenderOrgId_status_idx" ON "Loan"("lenderOrgId", "status");

-- CreateIndex
CREATE INDEX "Loan_farmerId_status_idx" ON "Loan"("farmerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LoanRepayment_splitId_key" ON "LoanRepayment"("splitId");

-- CreateIndex
CREATE INDEX "LoanRepayment_loanId_idx" ON "LoanRepayment"("loanId");

-- CreateIndex
CREATE UNIQUE INDEX "AgroDealer_orgId_key" ON "AgroDealer"("orgId");

-- CreateIndex
CREATE INDEX "DealerItem_dealerId_active_idx" ON "DealerItem"("dealerId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "InputVoucher_code_key" ON "InputVoucher"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InputVoucher_loanId_key" ON "InputVoucher"("loanId");

-- CreateIndex
CREATE INDEX "InputVoucher_farmerId_status_idx" ON "InputVoucher"("farmerId", "status");

-- CreateIndex
CREATE INDEX "InputVoucher_status_expiresAt_idx" ON "InputVoucher"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherRedemption_ref_key" ON "VoucherRedemption"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherRedemption_clientRef_key" ON "VoucherRedemption"("clientRef");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherRedemption_settlementPaymentId_key" ON "VoucherRedemption"("settlementPaymentId");

-- CreateIndex
CREATE INDEX "VoucherRedemption_dealerId_createdAt_idx" ON "VoucherRedemption"("dealerId", "createdAt");

-- CreateIndex
CREATE INDEX "VoucherRedemption_voucherId_idx" ON "VoucherRedemption"("voucherId");

-- CreateIndex
CREATE INDEX "CreditScore_farmerId_isCurrent_idx" ON "CreditScore"("farmerId", "isCurrent");

-- CreateIndex
CREATE INDEX "CreditScore_isCurrent_band_idx" ON "CreditScore"("isCurrent", "band");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRequest_ref_key" ON "ConsentRequest"("ref");

-- CreateIndex
CREATE INDEX "ConsentRequest_farmerId_status_idx" ON "ConsentRequest"("farmerId", "status");

-- CreateIndex
CREATE INDEX "ConsentRequest_requesterOrgId_status_idx" ON "ConsentRequest"("requesterOrgId", "status");

-- CreateIndex
CREATE INDEX "PassportAccessLog_farmerId_viewedAt_idx" ON "PassportAccessLog"("farmerId", "viewedAt");

-- CreateIndex
CREATE INDEX "SavingsProduct_custodianOrgId_idx" ON "SavingsProduct"("custodianOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "SavingsAccount_ref_key" ON "SavingsAccount"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "SavingsAccount_splitRuleId_key" ON "SavingsAccount"("splitRuleId");

-- CreateIndex
CREATE INDEX "SavingsAccount_status_lockedUntil_idx" ON "SavingsAccount"("status", "lockedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "SavingsAccount_farmerId_productId_key" ON "SavingsAccount"("farmerId", "productId");

-- CreateIndex
CREATE INDEX "SavingsTransaction_accountId_createdAt_idx" ON "SavingsTransaction"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavingsTransaction_splitId_type_key" ON "SavingsTransaction"("splitId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "SavingsGroup_ref_key" ON "SavingsGroup"("ref");

-- CreateIndex
CREATE INDEX "SavingsGroup_cooperativeId_idx" ON "SavingsGroup"("cooperativeId");

-- CreateIndex
CREATE INDEX "SavingsGroupMember_farmerId_idx" ON "SavingsGroupMember"("farmerId");

-- CreateIndex
CREATE UNIQUE INDEX "SavingsGroupMember_groupId_farmerId_key" ON "SavingsGroupMember"("groupId", "farmerId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupContribution_groupId_farmerId_periodNo_key" ON "GroupContribution"("groupId", "farmerId", "periodNo");

-- CreateIndex
CREATE UNIQUE INDEX "GroupPayout_groupId_periodNo_key" ON "GroupPayout"("groupId", "periodNo");

-- AddForeignKey
ALTER TABLE "LoanProduct" ADD CONSTRAINT "LoanProduct_lenderOrgId_fkey" FOREIGN KEY ("lenderOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "LoanProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_lenderOrgId_fkey" FOREIGN KEY ("lenderOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SavingsGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroDealer" ADD CONSTRAINT "AgroDealer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroDealer" ADD CONSTRAINT "AgroDealer_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerItem" ADD CONSTRAINT "DealerItem_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "AgroDealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputVoucher" ADD CONSTRAINT "InputVoucher_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputVoucher" ADD CONSTRAINT "InputVoucher_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherRedemption" ADD CONSTRAINT "VoucherRedemption_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "InputVoucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherRedemption" ADD CONSTRAINT "VoucherRedemption_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "AgroDealer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditScore" ADD CONSTRAINT "CreditScore_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRequest" ADD CONSTRAINT "ConsentRequest_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRequest" ADD CONSTRAINT "ConsentRequest_requesterOrgId_fkey" FOREIGN KEY ("requesterOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassportAccessLog" ADD CONSTRAINT "PassportAccessLog_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "ConsentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialInstitution" ADD CONSTRAINT "FinancialInstitution_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsProduct" ADD CONSTRAINT "SavingsProduct_custodianOrgId_fkey" FOREIGN KEY ("custodianOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsAccount" ADD CONSTRAINT "SavingsAccount_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsAccount" ADD CONSTRAINT "SavingsAccount_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SavingsProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsTransaction" ADD CONSTRAINT "SavingsTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SavingsAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGroup" ADD CONSTRAINT "SavingsGroup_cooperativeId_fkey" FOREIGN KEY ("cooperativeId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGroupMember" ADD CONSTRAINT "SavingsGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SavingsGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGroupMember" ADD CONSTRAINT "SavingsGroupMember_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupContribution" ADD CONSTRAINT "GroupContribution_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SavingsGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupContribution" ADD CONSTRAINT "GroupContribution_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPayout" ADD CONSTRAINT "GroupPayout_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SavingsGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPayout" ADD CONSTRAINT "GroupPayout_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
