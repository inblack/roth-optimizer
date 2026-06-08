# Roth Conversion Optimizer - Technical Requirements & Specification

This document details the methods, inputs, calculations, and scenarios for the Roth Conversion Optimizer tool.

---

## 1. Core Simulation Flow & Inputs

### Input Controls & Interface
*   **Dual-Input Synchronization:** Every assumption and balance slider must be paired with an adjacent numeric text input field. Adjusting the slider updates the text field, and typing into the text field updates the slider in real-time, allowing for precise keyboard entry.

### Starting Assets (Initial Portfolio State)
*   **Traditional IRA Balance** (`currentIRABalance`)
*   **Roth IRA Balance** (`currentRothBalance`)
*   **Taxable Brokerage Balance** (`currentBrokerageBalance`)
*   **Taxable Brokerage Cost Basis** (`currentBrokerageBasis`) — Required to accurately calculate realized capital gains when selling brokerage assets.

### Annual Growth & Inflation Rates
*   **Pre-Tax Assets (IRA):** Growth is tax-deferred.
*   **Post-Tax Assets (Roth):** Growth is tax-free.
*   **Taxable Assets (Brokerage):** Models two components:
    1.  *Unrealized growth:* Capital appreciation (tax-deferred until sold).
    2.  *Realized growth:* Annual dividend/interest yield (taxable annually). Accepts both `annualBrokerageGrowthRate` and a separate `annualDividendYield` (taxed annually as ordinary income/qualified dividends).
*   **Inflation Adjustment:** All tax brackets, standard deductions, pension streams, Social Security benefits, and asset growth rates will grow at a fixed annual inflation rate (e.g., 2.5% default).

### Annual Income Streams
*   **Pension / Other Ordinary Income:** Taxable income streams specified with start/end years or year-by-year.
*   **Social Security (SS):** Calculated dynamically based on start age and benefit amount.
    *   *Example:* `(2027-2031) $0; (2032-) $60,000`
*   **Required Minimum Distributions (RMDs):** Calculated dynamically each year based on the traditional IRA balance on Dec 31 of the previous year divided by the IRS Uniform Lifetime Table factor.
    *   *RMD Age Rules:* Account for SECURE Act 2.0 (RMD age is 73 for those born 1951-1959, and 75 for those born 1960 or later. E.g., born 1961 begins RMDs at **75**).
*   **Taxable Capital Gains (Baseline):** Annual realized gains from routine portfolio maintenance.
    *   *Example:* `(2026-) $12,000`

### Contextual Parameters
*   **Start Year of Analysis** (e.g., 2027)
*   **Birth Year** (e.g., 1961)
*   **Retirement Year** (e.g., 2022)
*   **Filing Status** (Initially "Single")
*   **State of Residence** — User selects their state so state-specific tax rates can be calculated.
*   **Medicare Start Date** (e.g., 12/26 or 2026)
*   **Historical MAGI (for IRMAA 2-year lookback):**
    *   *Example:* `(2024: $12,000; 2025: $20,000; 2026: $10,000)`

---

## 2. Tax & Cost Engine (Yearly Calculations)

For each year, the engine consolidates all income streams and asset activities:

1.  **Modified Adjusted Gross Income (MAGI):**
    *   Used to determine Medicare IRMAA surcharges.
    *   Formulated as AGI + tax-exempt interest + half of SS benefits (plus other minor adjustments).
2.  **Adjusted Gross Income (AGI) & Taxable Income:**
    *   AGI = Pension + RMDs + Taxable SS + Ordinary Dividends + Realized Capital Gains + Roth Conversions.
    *   Taxable Income = AGI - Standard Deduction.
3.  **Taxable Social Security:**
    *   Calculated using the IRS worksheet based on "Provisional Income" (AGI excluding SS + Tax-exempt interest + 50% of SS benefit).
4.  **Taxes & Costs:**
    *   **Federal Income Tax:** Applied to Ordinary Taxable Income.
    *   **State Income Tax:** Calculated based on known tax rates by law for the user's identified state.
    *   **Capital Gains Tax:** Applied to realized capital gains (using 0%/15%/20% brackets based on taxable income).
    *   **IRMAA Surcharges:** Added to Medicare premiums based on MAGI from 2 years prior.

---

## 3. Scenarios & Comparison (The "Scorecard")

The tool compares two core scenarios over a defined timeline (e.g., to age 90 or 95):

1.  **Scenario A: Without Roth Conversions** (Baseline)
2.  **Scenario B: With Optimized Roth Conversions**

### Optimization Strategy
*   **Mathematical Optimizer:** The system runs a search algorithm to find the exact annual conversion amounts that maximize the final ending Net Worth.
*   **Conversion Tax Payment Source:** The model prioritizes paying conversion taxes using the taxable Brokerage account rather than withholding from the converted IRA amount, leaving more assets in the tax-free Roth wrapper.

### Ending Net Worth & Portfolio Valuation
To compare scenarios and run the mathematical optimizer, we calculate both nominal and tax-adjusted values. Without discounting the Traditional IRA for its embedded tax liability, the optimizer would value pre-tax and post-tax dollars equally, failing to find a true optimum.

We calculate the scorecard metrics as:
*   **Nominal Net Worth** = Traditional IRA + Roth IRA + Brokerage
*   **After-Tax Adjusted Net Worth** = (Traditional IRA * (1 - IRA Tax Discount Rate)) + Roth IRA + Brokerage

*   **IRA Tax Discount Rate:** The tool will ask the user for an estimated tax discount rate (representing the expected average tax rate on future withdrawals by the retiree or their beneficiaries) or assume a default rate (e.g., 20% or 25%). The mathematical optimizer will target the maximization of the **After-Tax Adjusted Net Worth**.
*   **Beneficiary Tax Liability Note:** The tool will explicitly note and display the future tax drag on the traditional IRA balance for beneficiaries (due to the SECURE Act 10-Year Rule forcing non-spouse beneficiaries to empty the IRA in 10 years) to help the user choose an appropriate discount rate.


## 4. Tool Options & Feasibility Analysis

### Option 1: Google Sheets
*   **Optimizer Capability:** Google Sheets has a built-in **Solver add-on** (by Frontline Systems). However, it requires manual activation, runs relatively slowly, and can be fragile if sheet formulas change. Custom optimization can also be programmed via Google Apps Script (JavaScript), but it is constrained by execution speed and spreadsheet read/write latency.
*   **Pros:** Easy to view/edit formulas directly; familiar interface.
*   **Cons:** Poor user experience for non-technical users; slow optimization times; UI is locked to a spreadsheet grid; difficult to handle complex, non-linear multi-scenario logic (like Social Security taxability worksheets) cleanly.

### Option 2: Static Web Page Hosted on GitHub Pages (`github.io`)
*   **Optimizer Capability:** Highly feasible. We can run optimization algorithms (e.g., grid search, gradient-based optimization, or heuristic bracket-filling) directly in JavaScript. Calculations execute in milliseconds, allowing real-time updates as the user adjusts input sliders.
*   **Pros:**
    *   **Interactive UI/UX:** Can display real-time charts showing asset projections, tax bracket margins, and the conversion schedule.
    *   **Security & Privacy:** All calculations happen client-side in the browser. Financial data never leaves the user's computer.
    *   **Zero Hosting Costs:** Free to deploy and host on GitHub Pages.
    *   **Testability:** Easier to write clean, modular test suites for complex calculations (Federal/State brackets, IRMAA cliffs, SS provisional income).
*   **Cons:** Requires building a custom frontend interface.

### Recommendation
**Option 2 (Static Web Page on GitHub Pages)** is highly recommended. The non-linear nature of US tax laws (especially the Social Security "tax torpedo" and IRMAA cliffs) makes spreadsheet modeling extremely complex and error-prone. A JavaScript-based engine running on a clean, modern web page will be faster, more robust, and significantly more interactive.
