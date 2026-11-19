# AgriLink Salone — MVP for the FinTech Innovation Challenge

**The pitch in one sentence:** when a co-op buys a farmer's harvest through AgriLink, the payment saves for next season, builds a credit record, and repays input loans automatically, on the mobile money wallets farmers already have.

## Why an MVP, not the whole platform

The codebase now has 8 modules, 6 portals and 92 API endpoints. That is the right foundation, but it is the wrong thing to show:

- **The challenge asks for an MVP.** The required stage is _"prototype or Minimum Viable Product (MVP) with room for refinement"_, and the application needs _"demo link, screenshots or brief video"_ (deadline **20 November 2026**). Demo Day is 15 January 2027.
- **Judges score one clear problem and solution.** "Relevance to the stated problem" (25%) and "Innovation" (15%) reward a sharp story more than a long feature list.
- **The exclusion rule.** _"Solutions not related to agricultural payments/financial services or those already in large-scale commercial deployment"_ are out of scope. The demo must show at a glance that AgriLink:
  1. **is agricultural financial services.** Every screen shown is about a farmer's harvest money: payment, savings, credit. Registry, admin and settings screens are not shown.
  2. **is not another mobile money app.** Orange Money, Afrimoney and QMoney are already at large scale. AgriLink does not compete with them; it **runs on top of them** and adds what they don't do: harvest-linked splitting, farm records and a credit passport. AgriLink never holds money.
  3. **is not in commercial deployment.** It is a working MVP with demo data, no live users and no revenue yet. That is exactly the eligible stage.

## The MVP: one loop, one farmer

```
   Co-op buys rice ──► Smart Split pays farmer ──► Passport score rises
         ▲              + saves 15% (Harvest Lock)          │
         │                                                  ▼
   Next sale repays ◄── Dealer gives fertiliser ◄── Farmer gets input loan
   the loan automatically   (voucher, SMS code)       (PIN, plain terms)
```

Aminata, a rice farmer in Bombali, goes once around this loop in the demo. Each step maps to a use case in the challenge's terms of reference:

| Step                             | What the audience sees                                                              | TOR use case                                    |
| -------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1. Co-op records the harvest     | Weighed rice → price → farmer's net amount                                          | (f) Record keeping · (g) Digital transformation |
| 2. Co-op approves, AgriLink pays | Smart Split: farmer's wallet + 15% to Harvest Lock; SMS receipt                     | (a) Digital payments · (b) Savings              |
| 3. Passport                      | Score 0–100 from real sales and savings, with tips; the farmer controls who sees it | (d) Credit scoring with alternative data        |
| 4. Input loan                    | Plain-language terms → PIN → lender approves → voucher by SMS                       | (d) Credit / access to finance                  |
| 5. Agro-dealer                   | Voucher code → items → farmer's SMS code → dealer paid same day                     | (a) Digital payments                            |
| 6. Next sale                     | Loan taken first (capped), saving next, farmer keeps ≥ 30%                          | (a) + (b) + (d) together                        |

Five minutes, four use cases, one farmer. The full script is in [demo-script.md](demo-script.md).

## Files in this folder

| File                                                 | Use it for                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [README.md](README.md)                               | This overview: why MVP, the loop, positioning                                               |
| [scope.md](scope.md)                                 | Exactly what is in, hidden or postponed, and the small code changes to make it an MVP build |
| [demo-script.md](demo-script.md)                     | The 5-minute live demo and the 2-minute video for the application                           |
| [application-checklist.md](application-checklist.md) | What to submit by 20 November, mapped to the scoring criteria                               |
