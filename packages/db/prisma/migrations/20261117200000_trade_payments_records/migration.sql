-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('WEB', 'MOBILE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('BUYER_TO_FARMER', 'LOAN_DISBURSEMENT', 'VOUCHER_SETTLEMENT', 'SAVINGS_RELEASE', 'PROGRAMME_DISBURSEMENT');

-- CreateEnum
CREATE TYPE "SplitType" AS ENUM ('LOAN_REPAYMENT', 'SAVINGS', 'COOP_DUES', 'INSURANCE_PREMIUM', 'FARMER_WALLET');

-- CreateEnum
CREATE TYPE "SplitMode" AS ENUM ('PERCENT', 'FIXED', 'OUTSTANDING_BALANCE');

-- CreateEnum
CREATE TYPE "ProviderCode" AS ENUM ('MOCK', 'ORANGE_MONEY', 'AFRIMONEY', 'QMONEY', 'SAPS', 'BANK');

-- CreateEnum
CREATE TYPE "RecordType" AS ENUM ('INPUT_PURCHASE', 'LABOUR', 'LAND_PREP', 'TRANSPORT', 'OTHER_COST', 'HARVEST', 'SALE', 'OTHER_INCOME');

-- CreateEnum
CREATE TYPE "RecordSource" AS ENUM ('USSD', 'APP', 'AGENT', 'COOP', 'AUTO_PURCHASE', 'AUTO_VOUCHER', 'AUTO_PAYMENT');

-- CreateEnum
CREATE TYPE "Verification" AS ENUM ('SELF_REPORTED', 'AGENT_CONFIRMED', 'SYSTEM_VERIFIED');

-- CreateEnum
CREATE TYPE "BuyerType" AS ENUM ('AGGREGATOR', 'PROCESSOR', 'EXPORTER', 'TRADER', 'INSTITUTION');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('OPEN', 'SUBMITTED', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('RECORDED', 'APPROVED', 'PAYMENT_PENDING', 'PAID', 'PAYMENT_FAILED', 'DISPUTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "deviceName" TEXT,
ADD COLUMN     "kind" "SessionKind" NOT NULL DEFAULT 'WEB';

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL,
    "purchaseId" TEXT,
    "payerOrgId" TEXT,
    "farmerId" TEXT,
    "grossLe" DECIMAL(14,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "approvedById" TEXT,
    "explanation" JSONB,
    "receiptSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSplit" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "SplitType" NOT NULL,
    "amountLe" DECIMAL(14,2) NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "PaymentSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderInstruction" (
    "id" TEXT NOT NULL,
    "splitId" TEXT NOT NULL,
    "provider" "ProviderCode" NOT NULL,
    "fromAccount" TEXT NOT NULL,
    "toAccount" TEXT NOT NULL,
    "amountLe" DECIMAL(14,2) NOT NULL,
    "narration" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerRef" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT true,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitRule" (
    "id" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "type" "SplitType" NOT NULL,
    "priority" INTEGER NOT NULL,
    "mode" "SplitMode" NOT NULL,
    "value" DECIMAL(14,2),
    "ofGross" BOOLEAN NOT NULL DEFAULT false,
    "capLe" DECIMAL(14,2),
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "consentRef" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SplitRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitLe" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "creditLe" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentId" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCallback" (
    "id" TEXT NOT NULL,
    "provider" "ProviderCode" NOT NULL,
    "headers" JSONB NOT NULL,
    "body" TEXT NOT NULL,
    "signatureOk" BOOLEAN NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderCallback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "provider" "ProviderCode" NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "matched" INTEGER NOT NULL,
    "mismatched" INTEGER NOT NULL,
    "missing" INTEGER NOT NULL,
    "report" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmRecord" (
    "id" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "cropCycleId" TEXT,
    "cropId" TEXT,
    "season" TEXT NOT NULL,
    "type" "RecordType" NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(12,2),
    "unit" TEXT,
    "amountLe" DECIMAL(14,2),
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "source" "RecordSource" NOT NULL,
    "verification" "Verification" NOT NULL DEFAULT 'SELF_REPORTED',
    "sourceRef" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FarmRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonSummary" (
    "id" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "totalCostLe" DECIMAL(14,2) NOT NULL,
    "totalSalesLe" DECIMAL(14,2) NOT NULL,
    "harvestKg" DECIMAL(12,2) NOT NULL,
    "netLe" DECIMAL(14,2) NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "verifiedShare" DECIMAL(5,2) NOT NULL,
    "byType" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "smsSentAt" TIMESTAMP(3),

    CONSTRAINT "SeasonSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cooperative" (
    "orgId" TEXT NOT NULL,
    "registrationNo" TEXT,
    "mainCrops" TEXT[],
    "duesPct" DECIMAL(5,2),
    "duesFlatLe" DECIMAL(14,2),
    "approvalThresholdLe" DECIMAL(14,2),
    "fundingProvider" "MobileMoneyProvider",
    "fundingAccount" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cooperative_pkey" PRIMARY KEY ("orgId")
);

-- CreateTable
CREATE TABLE "Buyer" (
    "orgId" TEXT NOT NULL,
    "type" "BuyerType" NOT NULL DEFAULT 'AGGREGATOR',
    "crops" TEXT[],
    "approvalThresholdLe" DECIMAL(14,2),
    "fundingProvider" "MobileMoneyProvider",
    "fundingAccount" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Buyer_pkey" PRIMARY KEY ("orgId")
);

-- CreateTable
CREATE TABLE "CollectionPoint" (
    "id" TEXT NOT NULL,
    "ownerOrgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "community" TEXT NOT NULL,
    "districtId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceList" (
    "id" TEXT NOT NULL,
    "ownerOrgId" TEXT NOT NULL,
    "cropId" TEXT NOT NULL,
    "grade" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "priceLe" DECIMAL(14,2) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseBatch" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "ownerOrgId" TEXT NOT NULL,
    "collectionPointId" TEXT,
    "status" "BatchStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "clientRef" TEXT,
    "farmerId" TEXT NOT NULL,
    "buyerOrgId" TEXT NOT NULL,
    "cooperativeId" TEXT,
    "batchId" TEXT NOT NULL,
    "cropId" TEXT NOT NULL,
    "cropCycleId" TEXT,
    "grade" TEXT,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "bags" INTEGER,
    "unitPriceLe" DECIMAL(14,2) NOT NULL,
    "listPriceLe" DECIMAL(14,2),
    "priceOverrideReason" TEXT,
    "grossLe" DECIMAL(14,2) NOT NULL,
    "deductions" JSONB NOT NULL DEFAULT '[]',
    "deductionsLe" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netLe" DECIMAL(14,2) NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'RECORDED',
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "ackDeadline" TIMESTAMP(3) NOT NULL,
    "farmerAcknowledgedAt" TIMESTAMP(3),
    "disputedAt" TIMESTAMP(3),
    "disputeReason" TEXT,
    "disputeResolvedAt" TIMESTAMP(3),
    "disputeResolution" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_sessionId_idx" ON "RefreshToken"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_ref_key" ON "Payment"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_purchaseId_key" ON "Payment"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_payerOrgId_status_idx" ON "Payment"("payerOrgId", "status");

-- CreateIndex
CREATE INDEX "Payment_farmerId_idx" ON "Payment"("farmerId");

-- CreateIndex
CREATE INDEX "PaymentSplit_paymentId_idx" ON "PaymentSplit"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderInstruction_idempotencyKey_key" ON "ProviderInstruction"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderInstruction_providerRef_key" ON "ProviderInstruction"("providerRef");

-- CreateIndex
CREATE INDEX "ProviderInstruction_status_nextAttemptAt_idx" ON "ProviderInstruction"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "SplitRule_farmerId_active_idx" ON "SplitRule"("farmerId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_code_key" ON "LedgerAccount"("code");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_idx" ON "LedgerEntry"("accountId");

-- CreateIndex
CREATE INDEX "LedgerEntry_journalId_idx" ON "LedgerEntry"("journalId");

-- CreateIndex
CREATE INDEX "LedgerEntry_paymentId_idx" ON "LedgerEntry"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "FarmRecord_sourceRef_key" ON "FarmRecord"("sourceRef");

-- CreateIndex
CREATE INDEX "FarmRecord_farmerId_season_idx" ON "FarmRecord"("farmerId", "season");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonSummary_farmerId_season_key" ON "SeasonSummary"("farmerId", "season");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionPoint_ownerOrgId_name_key" ON "CollectionPoint"("ownerOrgId", "name");

-- CreateIndex
CREATE INDEX "PriceList_ownerOrgId_cropId_validFrom_idx" ON "PriceList"("ownerOrgId", "cropId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseBatch_ref_key" ON "PurchaseBatch"("ref");

-- CreateIndex
CREATE INDEX "PurchaseBatch_ownerOrgId_status_idx" ON "PurchaseBatch"("ownerOrgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_ref_key" ON "Purchase"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_clientRef_key" ON "Purchase"("clientRef");

-- CreateIndex
CREATE INDEX "Purchase_farmerId_idx" ON "Purchase"("farmerId");

-- CreateIndex
CREATE INDEX "Purchase_buyerOrgId_status_idx" ON "Purchase"("buyerOrgId", "status");

-- CreateIndex
CREATE INDEX "Purchase_batchId_idx" ON "Purchase"("batchId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSplit" ADD CONSTRAINT "PaymentSplit_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderInstruction" ADD CONSTRAINT "ProviderInstruction_splitId_fkey" FOREIGN KEY ("splitId") REFERENCES "PaymentSplit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitRule" ADD CONSTRAINT "SplitRule_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmRecord" ADD CONSTRAINT "FarmRecord_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonSummary" ADD CONSTRAINT "SeasonSummary_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cooperative" ADD CONSTRAINT "Cooperative_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Buyer" ADD CONSTRAINT "Buyer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPoint" ADD CONSTRAINT "CollectionPoint_ownerOrgId_fkey" FOREIGN KEY ("ownerOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_ownerOrgId_fkey" FOREIGN KEY ("ownerOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBatch" ADD CONSTRAINT "PurchaseBatch_ownerOrgId_fkey" FOREIGN KEY ("ownerOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBatch" ADD CONSTRAINT "PurchaseBatch_collectionPointId_fkey" FOREIGN KEY ("collectionPointId") REFERENCES "CollectionPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_buyerOrgId_fkey" FOREIGN KEY ("buyerOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PurchaseBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
