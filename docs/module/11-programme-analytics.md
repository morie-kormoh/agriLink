# Module 11 — Programme & Analytics Dashboards

## 1. Purpose

Turn platform data into decisions for each audience — co-ops, buyers, lenders, government/donor programmes and the AgriLink team — and produce the **impact metrics required for the challenge's quarterly reports**, disaggregated by gender, youth and disability.

## 2. Scope

**In:** KPI definitions, materialised views / reporting tables, role dashboards, district map, impact report generator (PDF/CSV), programme disbursement tracking, anonymisation & small-cell suppression, score-fairness monitoring.
**Out:** External BI tools (can connect later via read-only replica).

## 3. Dependencies

02–08, 13.

## 4. KPI catalogue

| KPI                            | Definition                                                    | Disaggregation                                    |
| ------------------------------ | ------------------------------------------------------------- | ------------------------------------------------- |
| Farmers registered             | `Farmer.status=ACTIVE`                                        | gender, youth (18–35), disability, district, crop |
| First digital transaction      | farmers whose first ever successful payment came via AgriLink | gender, youth                                     |
| Digital farmer payments        | count & value of successful BUYER_TO_FARMER payments          | district, crop, co-op                             |
| Cash-to-digital share          | digital payment value ÷ total purchase value per co-op        | co-op                                             |
| Time to pay                    | median minutes from purchase approval to farmer split success | provider                                          |
| Savers                         | farmers with ≥ 1 savings credit in period                     | gender, youth                                     |
| Savings balance & released     | totals                                                        | district                                          |
| Passport bands                 | distribution of current scores                                | gender, youth (fairness monitor)                  |
| Loans facilitated              | count, value, % first-time borrowers                          | gender, youth, lender                             |
| Repayment rate / PAR30 / PAR90 | standard portfolio metrics                                    | lender, crop, district                            |
| Vouchers redeemed              | count, value, dealers active                                  | district                                          |
| Jobs created                   | agents & staff active                                         | gender, youth                                     |
| USSD completion rate           | completed ÷ started sessions                                  | menu                                              |

All KPI SQL lives in one place (`server/analytics/kpis.ts`) with tests against seeded data.

## 5. Data model (`prisma/schema/analytics.prisma` + SQL)

```prisma
model DailyMetric {
  id        String   @id @default(cuid())
  date      DateTime @db.Date
  metric    String
  dimension Json                     // {"district":"BOM","gender":"FEMALE"}
  value     Decimal  @db.Decimal(18,2)
  @@index([metric, date])
}

model ReportRun {
  id        String   @id @default(cuid())
  type      String                   // QUARTERLY_IMPACT, COOP_SEASON, LENDER_PORTFOLIO
  period    String                   // 2027-Q1
  scopeOrgId String?
  fileKey   String?
  createdById String
  createdAt DateTime @default(now())
}
```

- Postgres **materialised views** for heavy aggregations (`mv_payments_daily`, `mv_farmers_dim`), refreshed by the worker every hour / nightly.
- `DailyMetric` snapshots keep history even if source rows change.

## 6. Privacy rules

- Programme officers and public views see **aggregates only**.
- **Small-cell suppression:** any cell with < 5 farmers shows "<5".
- Individual-level data for programmes only with farmer consent (module 07 scope).
- Exports watermark user + timestamp and are audited.

## 7. Dashboards & routes

- `/(coop)/dashboard`: members, collections this season, payments status, savings, loans of members, disputes.
- `/(buyer)/dashboard`: volumes by crop/collection point, payments, supplier count.
- `/(lender)/portfolio` (module 08) + passport band distribution of consented farmers.
- `/(programme)/dashboard`: national/district view, choropleth map (MapLibre + district GeoJSON), KPI cards, trends, gender/youth split.
- `/(admin)/impact`: all KPIs, period selector, **Generate quarterly impact report** button.

UI components: `StatCard`, Recharts line/bar charts via shadcn chart wrapper, `DataTable`, date-range picker, filter bar (district, crop, gender, youth).

## 8. Quarterly impact report (challenge requirement)

- Generated as PDF (React-PDF or server-side HTML → PDF) + CSV annex.
- Sections: summary KPIs vs targets, disaggregation tables, cash-to-digital progress, savings and credit outcomes, fairness check, stories (free-text field), challenges and next steps.
- Stored in S3, listed in `ReportRun`.

## 9. Step-by-step implementation

1. Write KPI definitions and SQL; unit-test against seed data with known expected values.
2. Materialised views + refresh jobs.
3. `DailyMetric` snapshot job.
4. Shared dashboard components and filter state in URL (nuqs or search params).
5. Co-op dashboard (MVP), then lender, buyer, programme, admin.
6. District GeoJSON + map component.
7. Small-cell suppression utility applied in programme queries.
8. Fairness monitor: score band by gender/youth with alert if gap > configured threshold.
9. Quarterly impact report generator + storage + download.
10. Export audit hooks (13).
    ✅ _Checkpoint (demo):_ one summary dashboard showing farmers, payments, savings and loans by district, split by gender and youth.

## 10. Acceptance criteria

- KPI numbers match source tables (tested).
- Programme views never expose individual farmers without consent; small cells suppressed.
- Quarterly report generated in < 1 minute for pilot-scale data.

## 11. Tests

- Unit: each KPI query on fixtures; suppression utility.
- Integration: MV refresh; report generation end to end.
