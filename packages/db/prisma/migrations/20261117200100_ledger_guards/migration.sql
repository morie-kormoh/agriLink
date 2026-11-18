-- Hand-written: ledger integrity rules Prisma can't express.

-- 1) Ledger entries are append-only (corrections are new reversing journals).
CREATE OR REPLACE FUNCTION agripay_ledger_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'LedgerEntry is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_immutable ON "LedgerEntry";
CREATE TRIGGER ledger_immutable
  BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION agripay_ledger_immutable();

-- 2) Every journal must balance (sum of debits = sum of credits), checked at COMMIT.
CREATE OR REPLACE FUNCTION agripay_ledger_journal_balanced() RETURNS trigger AS $$
DECLARE
  diff numeric;
BEGIN
  SELECT COALESCE(SUM("debitLe"), 0) - COALESCE(SUM("creditLe"), 0) INTO diff
  FROM "LedgerEntry" WHERE "journalId" = NEW."journalId";
  IF diff <> 0 THEN
    RAISE EXCEPTION 'Ledger journal % is unbalanced by %', NEW."journalId", diff;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_journal_balanced ON "LedgerEntry";
CREATE CONSTRAINT TRIGGER ledger_journal_balanced
  AFTER INSERT ON "LedgerEntry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION agripay_ledger_journal_balanced();

-- 3) An entry is either a debit or a credit, never negative.
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_one_side_chk"
  CHECK ("debitLe" >= 0 AND "creditLe" >= 0 AND ("debitLe" = 0 OR "creditLe" = 0) AND ("debitLe" + "creditLe") > 0);
