/**
 * Krio versions of the SMS AgriLink sends. Messages are written in English where they are created
 * (with names, amounts and refs filled in); this turns each known sentence into Krio for people who
 * chose Krio. Any sentence without a rule stays in English, so nothing is ever lost.
 * DRAFT wording — to be reviewed by native Krio speakers with farmers during the pilot.
 */

const M = String.raw`Le [\d,]+(?:\.\d{1,2})?`;
const re = (s: string, flags = "g") => new RegExp(s.replaceAll("{M}", M), flags);

const SPLIT_LABELS: [RegExp, string][] = [
  [/\bLoan repayment\b/g, "Lɔn pe-bak"],
  [/\bInsurance premium\b/g, "Inshɔrans"],
  [/\bCo-op dues\b/g, "Ko-op dyuz"],
  [/\bSavings\b/g, "Sev"],
  [/\bAgro-dealer settlement\b/g, "Dila pemɛnt"],
  [/\bTo farmer's wallet\b/g, "Fɔ di fama"],
  [/(^|, )You (Le )/g, "$1Yu $2"],
];

const RULES: [RegExp, string | ((...m: string[]) => string)][] = [
  // Prefixes
  [/^AgriLink reminder: /, "AgriLink rimayn: "],
  [/^AgriLink input voucher: /, "AgriLink input vawcha: "],

  // Purchase and payment
  [
    re(
      String.raw`(.+?) bought (\S+?)(kg|bag|tonne)(?: \((\d+) bags\))? (.+?)(?: grade (\S+))? @ ({M}) = ({M})\. `,
    ),
    (_m, org, qty, unit, bags, crop, grade, price, gross) =>
      `${org} bay ${qty}${unit}${bags ? ` (${bags} bag)` : ""} ${crop}${grade ? ` kwaliti ${grade}` : ""} @ ${price} = ${gross}. `,
  ],
  [re(String.raw`Deductions ({M})\. `), "Wetin kɔmɔt $1. "],
  [
    re(String.raw`Net ({M})\. Reply 1 to confirm, 2 to report a problem\.`),
    "Nɛt $1. Ansa 1 fɔ kɔnfɔm, 2 fɔ ripɔt prɔblɛm.",
  ],
  [
    re(String.raw`^AgriLink: (.+?) paid ({M}) for (\S+) (.+?)\. (.+)\. Ref (\S+)$`),
    (_m, org, amount, qty, crop, breakdown, ref) => {
      let b = breakdown ?? "";
      for (const [r, out] of SPLIT_LABELS) b = b.replace(r, out);
      return `AgriLink: ${org} pe ${amount} fɔ ${qty} ${crop}. ${b}. Ref ${ref}`;
    },
  ],
  [
    re(String.raw`purchase (\S+) \(({M})\) was cancelled\. Reason: `),
    "dɛn kansul di bay $1 ($2). Rizin: ",
  ],
  [
    /we received your report on (\S+)\. Payment is on hold until your cooperative reviews it\./,
    "wi gɛt yu ripɔt pan $1. Pemɛnt de ol te yu ko-op chɛk am.",
  ],
  [
    /your report on (\S+) was accepted\. The purchase was cancelled\./,
    "dɛn gri wit yu ripɔt pan $1. Dɛn kansul di bay.",
  ],
  [
    /your report on (\S+) was reviewed: (.+)\. Payment will continue\./,
    "dɛn chɛk yu ripɔt pan $1: $2. Pemɛnt go go bifo.",
  ],
  [/thank you, purchase (\S+) confirmed\./, "tɛnki, di bay $1 dɔn kɔnfɔm."],

  // Registration, invitations, security
  [
    /^Welcome to AgriLink, (.+?)\. Your AgriLink ID is (\S+)\. Keep this ID for payments, savings and loans\./,
    "Wɛlkɔm na AgriLink, $1. Yu AgriLink ID na $2. Kip dis ID fɔ pemɛnt, sev ɛn lɔn.",
  ],
  [
    /you've been invited to join (.+?)\. Open (\S+) to accept \(valid 7 days\)\./,
    "dɛn invayt yu fɔ jɔyn $1. Opin $2 fɔ gri (i gud fɔ 7 de).",
  ],
  [
    /your PIN was changed\. If this wasn't you, contact your cooperative or AgriLink support now\./,
    "dɛn chenj yu PIN. If nɔto yu, kɔl yu ko-op ɔ AgriLink sɔpɔt naw naw.",
  ],
  [
    /your PIN is locked for 30 minutes after 3 wrong attempts\. If this wasn't you, contact your cooperative\./,
    "yu PIN dɔn lɔk fɔ 30 minit afta 3 rɔng tray. If nɔto yu, kɔl yu ko-op.",
  ],

  // Savings
  [
    /Harvest Lock opened\. (\d+(?:\.\d+)?)% of each sale will be saved with (.+?)(?: and unlocks (.+?) for planting)?\. Ref (\S+)/,
    (_m, pct, product, date, ref) =>
      `Avɛst Lɔk dɔn opin. ${pct}% pan ɛni sɛl go sev wit ${product}${date ? ` ɛn i go opin ${date} fɔ plantin` : ""}. Ref ${ref}`,
  ],
  [
    re(
      String.raw`Savings goal "(.+?)" \(({M})\) opened\. (\d+(?:\.\d+)?)% of each sale will be saved\.`,
    ),
    'Yu dɔn opin sev fɔ "$1" ($2). $3% pan ɛni sɛl go sev.',
  ],
  [
    re(String.raw`({M}) saved to Harvest Lock\. Total ({M})\.`),
    "$1 dɔn sev na Avɛst Lɔk. Tɔtal $2.",
  ],
  [re(String.raw`({M}) saved to "(.+?)"\. Total ({M})\.`), '$1 dɔn sev fɔ "$2". Tɔtal $3.'],
  [/ Unlocks (.+?) for planting\./, " I go opin $1 fɔ plantin."],
  [/ Goal reached — well done!/, " Yu dɔn rich yu gol — wɛldɔn!"],
  [
    re(
      String.raw`({M}) from your Harvest Lock savings has been paid to your mobile money\. Good luck with planting!`,
    ),
    "$1 frɔm yu Avɛst Lɔk sev dɔn go na yu mobayl mɔni. Gud lɔk wit di plantin!",
  ],
  [
    re(
      String.raw`({M}) from your "(.+?)" savings has been paid to your mobile money\. Good luck with planting!`,
    ),
    '$1 frɔm yu "$2" sev dɔn go na yu mobayl mɔni. Gud lɔk wit di plantin!',
  ],
  [
    re(
      String.raw`early withdrawal of ({M}) paid to your mobile money \(fee ({M})\)\. Savings left: ({M})\.`,
    ),
    "di mɔni we yu pul bifo tɛm, $1, dɔn go na yu mobayl mɔni (fi $2). Sev we lɛf: $3.",
  ],
  [
    re(
      String.raw`your savings of ({M}) \((\S+)\) will be paid to your mobile money on (.+?) for planting\.`,
    ),
    "yu sev, $1 ($2), go go na yu mobayl mɔni pan $3 fɔ plantin.",
  ],
  [
    re(String.raw`(.+?) paid you the period (\d+) pot of ({M})\.`),
    "$1 pe yu di pɔt fɔ pɛriɔd $2: $3.",
  ],
  [
    re(String.raw`^AgriLink (.+?): your total savings this cycle is ({M})\.`),
    "AgriLink $1: ɔl wetin yu sev dis rawnd na $2.",
  ],

  // Season summary
  [
    re(
      String.raw`^AgriLink (\d{4}) (main|dry) season: (.+?), you spent ({M}) and sold ({M})(?: \(([\d,]+)kg\))?\. Net ({M})\. Keep recording to grow your AgriLink score\.`,
    ),
    (_m, year, kind, name, spent, sold, kg, net) =>
      `AgriLink ${year} ${kind === "main" ? "men" : "drɛy"} sizin: ${name}, yu spɛn ${spent} ɛn sɛl ${sold}${kg ? ` (${kg}kg)` : ""}. Nɛt ${net}. Kip fɔ rayt fɔ mek yu AgriLink skɔ grɔ.`,
  ],

  // Passport and consent
  [
    /your score is now (\d+) \((Building|Fair|Good|Strong)\)\./,
    (_m, s, b) => `yu skɔ na ${s} naw (${BAND[b] ?? b}).`,
  ],
  [/ Open AgriLink to see how to add points\./, " Opin AgriLink fɔ si aw fɔ ad pɔynt."],
  [
    /(.+?) wants to see (your AgriLink score|your AgriLink passport \(score, sales, savings and repayments\)|your AgriLink passport and all your farm records) to (.+?) for (\d+) months\. Open AgriLink to accept or decline\./,
    (_m, org, scope, purpose, months) =>
      `${org} want si ${SCOPE[scope] ?? scope} fɔ ${purpose} fɔ ${months} mɔnt. Opin AgriLink fɔ gri ɔ nɔ gri.`,
  ],
  [
    /(.+?) viewed your AgriLink passport \(you allowed this until (.+?)\)\. You can stop it anytime in AgriLink\./,
    "$1 luk yu AgriLink paspɔt (yu gri te $2). Yu kin stɔp am ɛnitɛm na AgriLink.",
  ],

  // Loans and vouchers
  [
    re(
      String.raw`your application (\S+) for ({M}) with (.+?) was received\. We will SMS you when it is approved\.`,
    ),
    "wi gɛt yu aplikeshɔn $1 fɔ $2 wit $3. Wi go SMS yu we dɛn apruv am.",
  ],
  [
    re(
      String.raw`(.+?) offers you an input loan of ({M})\. Open AgriLink > Loans to read the terms and accept\.`,
    ),
    "$1 de ɔfa yu input lɔn fɔ $2. Opin AgriLink > Lɔn fɔ rid di tɔm dɛn ɛn gri.",
  ],
  [
    /(.+?) could not approve loan (\S+)\. Keep selling and saving through AgriLink to raise your score\./,
    "$1 nɔ ebul apruv lɔn $2. Kip fɔ sɛl ɛn sev tru AgriLink fɔ mek yu skɔ go ɔp.",
  ],
  [
    re(String.raw`({M}) paid to your loan (\S+)\. Remaining ({M})\.`),
    "$1 dɔn pe fɔ yu lɔn $2. Wetin lɛf: $3.",
  ],
  [/ Loan fully repaid — thank you!/, " Yu dɔn pe di lɔn ɔl — tɛnki!"],
  [
    re(String.raw` Loan fully repaid! Your new limit is ({M})\.`),
    " Yu dɔn pe di lɔn ɔl! Yu nyu limit na $1.",
  ],
  [
    /(.+?) offers to move the due date of loan (\S+) to (.+?)\. No extra fee\. Open AgriLink > Loans to accept\./,
    "$1 de ɔfa fɔ muf di dey fɔ pe lɔn $2 to $3. No ɛkstra fi. Opin AgriLink > Lɔn fɔ gri.",
  ],
  [
    re(
      String.raw`loan (\S+) is (\d+) days past due\. ({M}) is still owed\. Sell through AgriLink or pay by mobile money to repay\. Call your co-op if you need help\.`,
    ),
    "lɔn $1 dɔn pas di dey wit $2 de. $3 stil lɛf fɔ pe. Sɛl tru AgriLink ɔ pe wit mobayl mɔni. Kɔl yu ko-op if yu nid ɛp.",
  ],
  [
    re(String.raw`loan (\S+) is due on (.+?)\. ({M}) left to repay\.`),
    "lɔn $1 fɔ pe pan $2. $3 lɛf fɔ pe.",
  ],
  [
    re(String.raw`loan (\S+) still has ({M}) to repay\. Call your co-op if you need help\.`),
    "lɔn $1 stil gɛt $2 fɔ pe. Kɔl yu ko-op if yu nid ɛp.",
  ],
  [
    re(
      String.raw`(\S+), ({M}), valid to (.+?) at (.+?)\. Show this code to the dealer\. Never share the confirmation code you get by SMS with anyone else\.`,
    ),
    "$1, $2, i gud te $3 na $4. Sho dis kod to di dila. Nɔ ɛva sheb di kɔnfɔm kod we yu gɛt na SMS wit ɛnibɔdi.",
  ],
  [/registered agro-dealers/, "agro-dila dɛn we rejista"],
  [
    re(
      String.raw`(.+?) wants to use ({M}) of your voucher for (.+?)\. If you agree, give them this code: (\d+)\. It expires in 5 minutes\.`,
    ),
    "$1 want yuz $2 pan yu vawcha fɔ $3. If yu gri, gi dɛn dis kod: $4. I go dɔn na 5 minit.",
  ],
  [
    re(String.raw`you used ({M}) of your input voucher at (.+?)\. Left on voucher: ({M})\.`),
    "yu yuz $1 pan yu input vawcha na $2. Wetin lɛf pan di vawcha: $3.",
  ],
  [
    re(String.raw`your input voucher (\S+) expired\. The unused ({M}) is not charged to you\.`),
    "yu input vawcha $1 dɔn ɛkspay. Dɛn nɔ go chaj yu fɔ di $2 we yu nɔ yuz.",
  ],
  [
    re(String.raw`({M}) settled to your mobile money for voucher redemption (\S+)\.`),
    "$1 dɔn go na yu mobayl mɔni fɔ vawcha $2.",
  ],
];

const BAND: Record<string, string> = {
  Building: "I de bil",
  Fair: "I fayn smɔl",
  Good: "I gud",
  Strong: "I tranga",
};
const SCOPE: Record<string, string> = {
  "your AgriLink score": "yu AgriLink skɔ",
  "your AgriLink passport (score, sales, savings and repayments)":
    "yu AgriLink paspɔt (skɔ, sɛl, sev ɛn pe-bak)",
  "your AgriLink passport and all your farm records": "yu AgriLink paspɔt ɛn ɔl yu fam rɛkɔd",
};

/** Krio version of an SMS for someone who chose Krio; English (or unknown) text is returned as is. */
export function translateSms(locale: string | null | undefined, body: string): string {
  if (locale !== "kri" || !body) return body;
  let out = body;
  for (const [pattern, replacement] of RULES) {
    out =
      typeof replacement === "string"
        ? out.replace(pattern, replacement)
        : out.replace(pattern, (...m) => replacement(...(m.slice(0, -2) as string[])));
  }
  return out;
}
