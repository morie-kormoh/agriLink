import kriText from "../messages/kri.text.json";

/** Krio for English messages that are composed in code with values inside them. */
const KRI_PATTERNS: [RegExp, string][] = [
  [/^(.+) not found\.$/, "Wi nɔ si di $1."],
  [/^Choose between (.+)% and (.+)%\.$/, "Pik bitwin $1% ɛn $2%."],
  [/^Only (.+) is owed\.$/, "Na $1 nɔmɔ lɛf fɔ pe."],
  [/^Payout position (.+) is already taken\.$/, "Pe-awt ples $1 dɔn tek."],
  [/^The minimum is (.+)\.$/, "Di smɔl wan na $1."],
  [/^This NIN is already registered to (.+)\.$/, "Dis NIN dɔn rejista to $1."],
  [/^This cycle has (.+) periods\.$/, "Dis rawnd gɛt $1 pɛriɔd."],
  [/^You can withdraw up to (.+)\.$/, "Yu kin pul te to $1."],
  [/^Wrong PIN\. (\d+) attempt\(s\) left\.$/, "Rɔng PIN. $1 tray lɛf."],
  [/^Only (.+) is left on this voucher\.$/, "Na $1 nɔmɔ lɛf pan dis vawcha."],
  [/^The most you can borrow now is (.+)\.$/, "Di mɔs yu kin lɛnt naw na $1."],
  [
    /^Loans above (.+) need a lender admin to approve\.$/,
    "Lɔn we pas $1 nid lɔn ɔfis admin fɔ apruv.",
  ],
  [
    /^Quantity looks too large \(max (.+) kg per purchase\)\.$/,
    "Di kwantiti luk tu big (di mɔs na $1 kg fɔ wan bay).",
  ],
  [/^Maximum (.+) rows per import\.$/, "Di mɔs na $1 lay fɔ wan impɔt."],
  [/^No price set for (.+)$/, "No prays nɔ sɛt fɔ $1"],
  [/^Not eligible: (.+)$/, "Yu nɔ kin gɛt am: $1"],
  [/^KYC tier (\d+)$/, "KYC lɛvul $1"],
  [/^(\d+) season\(s\) with regular records$/, "$1 sizin wit rɛkɔd ɛvri tɛm"],
  [
    /^Verified sales (Le [\d,.]+) in (\d+) month\(s\), last 12 months$/,
    "Sɛl we dɛn chɛk $1 insay $2 mɔnt, las 12 mɔnt",
  ],
  [/^(\d+) month\(s\) with savings$/, "$1 mɔnt wit sev"],
  [/^group contributions (\d+)% on time$/, "grup kɔntribyushɔn $1% na tɛm"],
  [/^(\d+) defaulted loan\(s\)$/, "$1 lɔn we nɔ pe"],
  [/^(\d+) repaid on time, (\d+) late$/, "$1 pe bak na tɛm, $2 let"],
  [/^Sold to the same buyer in (\d+) seasons$/, "Sɛl to di sem baya fɔ $1 sizin"],
];

/**
 * Translate a message that code wrote in English (server errors, validation messages).
 * Returns the English text unchanged for English, or when no Krio version exists yet.
 */
export function translateText(locale: string | undefined, text: string): string {
  if (locale !== "kri" || !text) return text;
  const exact = (kriText as Record<string, string>)[text];
  if (exact) return exact;
  for (const [re, out] of KRI_PATTERNS) if (re.test(text)) return text.replace(re, out);
  return text;
}

/** Passport factor evidence, which joins several short facts with ", ". */
export function translateEvidence(locale: string | undefined, text: string): string {
  if (locale !== "kri" || !text) return text;
  const whole = translateText(locale, text);
  if (whole !== text || !text.includes(", ")) return whole;
  return text
    .split(", ")
    .map((part) => translateText(locale, part))
    .join(", ");
}
