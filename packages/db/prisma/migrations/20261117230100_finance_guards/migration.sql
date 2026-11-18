-- Modules 06–08: invariants enforced by the database as well as the services.
ALTER TABLE "SavingsAccount" ADD CONSTRAINT "SavingsAccount_balance_nonnegative" CHECK ("balanceLe" >= 0);
ALTER TABLE "SavingsTransaction" ADD CONSTRAINT "SavingsTransaction_amount_positive" CHECK ("amountLe" > 0 AND "balanceAfterLe" >= 0);
ALTER TABLE "InputVoucher" ADD CONSTRAINT "InputVoucher_remaining_in_range" CHECK ("remainingLe" >= 0 AND "remainingLe" <= "valueLe");
ALTER TABLE "VoucherRedemption" ADD CONSTRAINT "VoucherRedemption_amount_positive" CHECK ("amountLe" > 0);
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_repaid_nonnegative" CHECK ("repaidLe" >= 0);
ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_amount_positive" CHECK ("amountLe" > 0);
ALTER TABLE "CreditScore" ADD CONSTRAINT "CreditScore_range" CHECK ("score" BETWEEN 0 AND 100);

-- Only one current score per farmer.
CREATE UNIQUE INDEX "CreditScore_one_current_per_farmer" ON "CreditScore" ("farmerId") WHERE "isCurrent";

-- Savings transactions are an audit trail: append-only.
CREATE OR REPLACE FUNCTION agripay_savings_txn_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SavingsTransaction is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "SavingsTransaction_append_only" BEFORE UPDATE OR DELETE ON "SavingsTransaction"
  FOR EACH ROW EXECUTE FUNCTION agripay_savings_txn_append_only();
