import "server-only";
import { prisma } from "@agrilink/db";
import { disclosure, loanDueDate } from "@agrilink/finance";
import { loanProductSchema, type LoanProductInput } from "@agrilink/validation";
import { type Actor, can } from "@agrilink/validation/permissions";
import { audit } from "../audit";
import { forbidden, notFound } from "../errors";
import { lenderOrgId } from "../finance/common";

export async function listLoanProducts(actor: Actor) {
  const where =
    actor.role === "LENDER_ADMIN" || actor.role === "LENDER_OFFICER"
      ? { lenderOrgId: lenderOrgId(actor) }
      : { active: true };
  return prisma.loanProduct.findMany({
    where,
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: { lenderOrg: { select: { name: true } }, _count: { select: { loans: true } } },
  });
}

export async function getLoanProduct(actor: Actor, id: string) {
  const p = await prisma.loanProduct.findUnique({
    where: { id },
    include: { lenderOrg: { select: { name: true } } },
  });
  if (!p) throw notFound("Loan product");
  if (
    (actor.role === "LENDER_ADMIN" || actor.role === "LENDER_OFFICER") &&
    p.lenderOrgId !== actor.orgId
  )
    throw notFound("Loan product");
  if (actor.role === "FARMER" && !p.active) throw notFound("Loan product");
  return p;
}

export async function saveLoanProduct(actor: Actor, input: LoanProductInput, id?: string) {
  if (!can(actor, "loanProduct.manage")) throw forbidden();
  const orgId = lenderOrgId(actor);
  const data = loanProductSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    if (id) {
      const before = await tx.loanProduct.findFirst({ where: { id, lenderOrgId: orgId } });
      if (!before) throw notFound("Loan product");
      const p = await tx.loanProduct.update({ where: { id }, data });
      await audit(tx, {
        actor,
        action: "loanProduct.updated",
        entity: "LoanProduct",
        entityId: id,
        before,
        after: data,
      });
      return p;
    }
    const p = await tx.loanProduct.create({ data: { ...data, lenderOrgId: orgId } });
    await audit(tx, {
      actor,
      action: "loanProduct.created",
      entity: "LoanProduct",
      entityId: p.id,
      after: data,
    });
    return p;
  });
}

/** The exact disclosure the farmer will see before accepting (app and USSD share this text). */
export async function disclosureFor(
  productId: string,
  amountLe: string,
  locale: "en" | "kri" = "en",
  at = new Date(),
) {
  const p = await prisma.loanProduct.findUnique({
    where: { id: productId },
    include: { lenderOrg: { select: { name: true } } },
  });
  if (!p) throw notFound("Loan product");
  return disclosure(
    {
      lenderName: p.lenderOrg.name,
      productName: p.name,
      principalLe: amountLe,
      flatFeePct: p.flatFeePct.toString(),
      maxRepaymentPctPerSale: p.maxRepaymentPctPerSale.toString(),
      dueDate: loanDueDate(p.dueMonthDay, at),
      voucherValidDays: p.voucherValidDays,
    },
    locale,
  );
}
