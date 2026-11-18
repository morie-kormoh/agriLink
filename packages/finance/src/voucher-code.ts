/**
 * Input voucher codes: 8 Crockford base-32 characters (7 random + 1 check), shown as "K7P4-R2QX".
 * Crockford's alphabet has no I, L, O or U, and reading is forgiving: O→0, I/L→1, case and dashes ignored,
 * so a code read aloud or typed on a feature phone still validates. The check character catches
 * almost all single-character typos and swaps of neighbours.
 */
export const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function checkChar(body: string): string {
  // Weighted sum mod 32 (weights 1..n) detects any single substitution and adjacent transpositions.
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += (i + 1) * CROCKFORD.indexOf(body[i]!);
  return CROCKFORD[sum % 31]!;
}

export function generateVoucherCode(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(7);
  let body = "";
  for (const b of bytes) body += CROCKFORD[b % 32];
  return body + checkChar(body);
}

export function normalizeVoucherCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

export function isValidVoucherCode(input: string): boolean {
  const c = normalizeVoucherCode(input);
  if (!/^[0-9A-HJKMNP-TV-Z]{8}$/.test(c)) return false;
  return checkChar(c.slice(0, 7)) === c[7];
}

export function formatVoucherCode(code: string): string {
  const c = normalizeVoucherCode(code);
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}
