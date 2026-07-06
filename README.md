# 🏠 Buy vs Rent + Invest — Vancouver, BC

A mobile-first calculator comparing **buying a home with a mortgage** vs **renting and
investing the difference into VFV** (a Canadian-listed S&P 500 ETF), tailored to a Vancouver,
BC buyer. Every input is a paired slider + editable number box; results update live.

**Illustrative estimate only — not financial advice.** Verify all figures with a mortgage
professional or accountant before making a decision.

Live: https://jm-cloud-apps.github.io/housing-calculator/

## What it models

- **Canadian mortgage math** — payments use the correct semi-annual compounding
  convention (not the US monthly formula).
- **CMHC mortgage default insurance** — minimum down payment tiers (5% on the first
  $500k + 10% above), premium rate tiers by loan-to-value, and the $1.5M insurability cap.
- **BC Property Transfer Tax** — marginal brackets (1% / 2% / 3% / 5%+), with an optional
  First-Time Home Buyers' exemption (full exemption under $835k, phasing out to $860k).
- **GDS (Gross Debt Service) ratio** — the 39% affordability check against P&I + property
  tax + heating + 50% of condo fees, shown when a gross household income is entered.
- **Cash needed to close** — down payment + BC PTT (after exemption, if applicable) +
  legal/inspection costs, shown as a single upfront total.
- **Rent + invest side** — the renter invests what they didn't spend on a down payment and
  closing costs, plus the ongoing gap between owning costs and rent, compounding at a
  configurable return. A TFSA (tax-free) / taxable (50% capital-gains inclusion) toggle
  controls how the portfolio is taxed.
- **Chart scrubber + break-even marker** — drag to see Buy vs. Rent+Invest net worth at any
  year, with the crossing point (if any) marked on the chart.
- **Other monthly expenses** (internet, phone, car insurance/payment, groceries) — purely
  informational, kept separate from the housing comparison.

## Documented simplifying assumptions

- Year-by-year projection, not month-by-month (mortgage math itself still compounds
  monthly internally).
- If rent costs more than owning in a given year, the renter contributes $0 extra that
  year rather than modeling a shortfall funded from elsewhere.
- Property tax and maintenance scale with the home's *current appreciated value*, not the
  original purchase price.
- Only GDS is checked, not TDS (Total Debt Service) — no other debts are modeled. The
  "Other monthly expenses" section is informational only and isn't factored into GDS/TDS.
- The BC First-Time Home Buyers' PTT exemption thresholds ($835k / $860k) reflect the 2024
  BC budget figures — verify current thresholds before relying on this, rules do change.
- The 30-year insured amortization option (first-time buyers / new builds only) is shown
  as a caveat note, not enforced as a hard rule.

## Local development

No build step — it's plain HTML/CSS/JS. Serve the directory with any static file server:

```bash
python3 -m http.server 4174
```

Then open http://localhost:4174.

## Project layout

| Path | Purpose |
| --- | --- |
| `index.html` | Page structure, field/result containers |
| `css/styles.css` | Mobile-first styling |
| `js/constants.js` | Default values, ranges, CMHC/PTT tables |
| `js/finance.js` | Pure calculation functions (mortgage, CMHC, PTT, GDS, tax) |
| `js/simulate.js` | Year-by-year buy-vs-rent projection |
| `js/sliderfield.js` | Paired slider + number input widget |
| `js/chart.js` | Hand-rolled canvas net-worth line chart |
| `js/ui.js` | DOM wiring and result rendering |
| `js/main.js` | Entry point |

## Deployment

Deploys automatically via GitHub Actions (`.github/workflows/deploy.yml`) on every push to
`main` — no build step, the whole repo is uploaded as the Pages artifact.
