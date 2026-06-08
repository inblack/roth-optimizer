# Roth Conversion Optimizer

A client-side Roth IRA conversion optimizer built as a static web application, hosted on GitHub Pages. All calculations run locally in the browser — no financial data is ever sent to a server.

## Features

- **Mathematical Search Optimizer** — Bracket-filling + coordinate descent algorithm finds the optimal annual Roth conversion schedule to maximize After-Tax Adjusted Net Worth.
- **Federal & State Tax Engine** — Accurate progressive tax bracket calculations with annual inflation indexing, Social Security taxability (provisional income worksheet), Medicare IRMAA surcharges, and RMDs (SECURE Act 2.0).
- **Dual-Input Controls** — Every slider is paired with a synchronized numeric input field for precise keyboard entry.
- **Net Worth Projections** — Side-by-side line chart comparing baseline vs. optimized scenarios to age 95.
- **Tax Bracket Visualization** — Stacked bar chart showing annual conversions relative to federal tax bracket limits.
- **Year-by-Year Detail Table** — Full annual breakdown showing IRA (pre-tax), Roth, Brokerage, Adjusted Net Worth (with IRA tax discount applied), RMDs, conversion amounts, taxes, and IRMAA surcharges.
- **IRMAA & Depletion Alerts** — Automatic warnings when Medicare surcharge tiers are triggered or the brokerage account is depleted.

## After-Tax Adjusted Net Worth Formula

```
Adjusted Net Worth = (IRA × (1 − Discount Rate)) + Roth + Brokerage
```

The IRA discount rate reflects the embedded income tax liability on pre-tax Traditional IRA funds. Default: 22%.

## Project Structure

```
├── index.html        # Dashboard layout
├── style.css         # Dark-mode glassmorphism design system
├── src/
│   ├── main.js           # UI controller & event handling
│   ├── taxEngine.js      # Federal/state brackets, RMDs, SS, IRMAA
│   ├── projectionRunner.js   # Year-by-year simulation loop
│   ├── optimizer.js      # Bracket-filling + coordinate descent optimizer
│   └── chartManager.js   # Chart.js line and bar chart rendering
├── requirements.md   # Technical specification
├── ux_proposal.md    # UX design proposal
└── implementation_plan.md   # Development plan
```

## Running Locally

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

## Hosting

Designed for deployment on GitHub Pages. No build step required — pure HTML, CSS, and ES6 modules.
