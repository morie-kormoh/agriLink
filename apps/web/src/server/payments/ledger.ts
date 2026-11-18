import "server-only";
import { type Db, Prisma, type Tx } from "@agripay/db";
import { randomUUID } from "node:crypto";

/**
 * Double-entry mirror ledger (module 04). Entries are only posted for provider-confirmed transfers.
 * A journal must balance — enforced here and by a deferred DB constraint trigger.
 *
 * Account codes:
 *   ORG:{orgId}:FUNDING           payer's disbursement account (debited when money leaves)
 *   FARMER:{agripayId}:WALLET     farmer's mobile money wallet (credited when paid)
 *   ORG:{orgId}:DUES              co-op dues received
 *   SAVINGS:{accountId}           savings held at the custodian (credits − releases − fees = balance)
 *   LOAN:{loanId}                 repayments received for a loan
 *   DEALER:{dealerId}             voucher settlements paid to an agro-dealer
 *   ORG:{orgId}:FEES              fees earned (e.g. early-withdrawal fee kept by the custodian)
 *   POLICY:{id}
 */
export interface JournalLine {
  accountCode: string;
  ownerType: string;
  ownerId: string;
  name: string;
  debitLe?: string;
  creditLe?: string;
  memo?: string;
}

export async function ensureAccount(
  tx: Tx,
  line: Pick<JournalLine, "accountCode" | "ownerType" | "ownerId" | "name">,
) {
  return tx.ledgerAccount.upsert({
    where: { code: line.accountCode },
    update: {},
    create: {
      code: line.accountCode,
      ownerType: line.ownerType,
      ownerId: line.ownerId,
      name: line.name,
    },
  });
}

export async function postJournal(
  tx: Tx,
  lines: JournalLine[],
  paymentId?: string | null,
): Promise<string> {
  const debit = lines.reduce((s, l) => s.plus(l.debitLe ?? 0), new Prisma.Decimal(0));
  const credit = lines.reduce((s, l) => s.plus(l.creditLe ?? 0), new Prisma.Decimal(0));
  if (!debit.equals(credit))
    throw new Error(`Unbalanced journal: debit ${debit} ≠ credit ${credit}`);
  const journalId = randomUUID();
  for (const l of lines) {
    const account = await ensureAccount(tx, l);
    await tx.ledgerEntry.create({
      data: {
        journalId,
        accountId: account.id,
        debitLe: new Prisma.Decimal(l.debitLe ?? 0),
        creditLe: new Prisma.Decimal(l.creditLe ?? 0),
        paymentId: paymentId ?? null,
        memo: l.memo ?? null,
      },
    });
  }
  return journalId;
}

/** Balance = credits − debits (positive = money received into the account). */
export async function balanceOf(db: Db, accountCode: string): Promise<Prisma.Decimal> {
  const rows = await db.$queryRaw<{ bal: Prisma.Decimal | null }[]>`
    SELECT SUM(e."creditLe" - e."debitLe") AS bal
    FROM "LedgerEntry" e JOIN "LedgerAccount" a ON a.id = e."accountId"
    WHERE a.code = ${accountCode}
  `;
  return new Prisma.Decimal(rows[0]?.bal ?? 0);
}

export const accountCodes = {
  funding: (orgId: string) => `ORG:${orgId}:FUNDING`,
  farmerWallet: (agripayId: string) => `FARMER:${agripayId}:WALLET`,
  coopDues: (orgId: string) => `ORG:${orgId}:DUES`,
  savings: (id: string) => `SAVINGS:${id}`,
  loan: (id: string) => `LOAN:${id}`,
  policy: (id: string) => `POLICY:${id}`,
  dealer: (dealerId: string) => `DEALER:${dealerId}`,
  fees: (orgId: string) => `ORG:${orgId}:FEES`,
};
