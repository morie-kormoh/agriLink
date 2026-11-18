/**
 * KYC tiers (module 02):
 *  1 — minimum registration (name, gender, phone, location, crop)
 *  2 — tier 1 + verified wallet name match OR cooperative attestation
 *  3 — tier 2 + National Identification Number
 */
export function computeKycTier(input: {
  hasVerifiedWallet: boolean;
  coopAttested: boolean;
  hasNin: boolean;
}): 1 | 2 | 3 {
  const tier2 = input.hasVerifiedWallet || input.coopAttested;
  if (tier2 && input.hasNin) return 3;
  if (tier2) return 2;
  return 1;
}

/** Simple name comparison for wallet-name verification: all name tokens of the shorter name present in the other. */
export function namesMatch(a: string, b: string): boolean {
  const tokens = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)];
  return short.every((t) => long.has(t));
}
