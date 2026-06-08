import { calculateRMD, calculateAnnualTaxes } from './taxEngine.js';

/**
 * Parses income profiles (e.g. "(2027-2031) 0; (2032-) 60000")
 * returns value for a given year.
 */
export function parseProfile(profileStr, targetYear, defaultValue = 0) {
    if (!profileStr) return defaultValue;
    const parts = profileStr.split(';');
    for (const part of parts) {
        const match = part.match(/\((\d+)-?(\d+)?\)\s*([\d,]+)/);
        if (match) {
            const start = parseInt(match[1], 10);
            const end = match[2] ? parseInt(match[2], 10) : Infinity;
            const value = parseFloat(match[3].replace(/,/g, ''));
            if (targetYear >= start && targetYear <= end) {
                return value;
            }
        }
    }
    return defaultValue;
}

/**
 * Main projection runner simulating years from startYear to age 95.
 */
export function runProjection({
    startYear,
    birthYear,
    currentAge,
    retirementAge,
    filingStatus,
    state,
    iraBalance,
    rothBalance,
    brokerageBalance,
    brokerageBasis,
    annualReturn,
    dividendYield,
    inflationRate,
    iraDiscountRate,
    ssProfile,
    pensionProfile,
    capGainsProfile,
    magiHistory, // [magi_2yr_prior, magi_1yr_prior, magi_current_start]
    conversions = {} // { year: amount }
}) {
    const years = [];
    const maxAge = 95;
    const startAge = currentAge;
    
    // Copy starting balances
    let ira = iraBalance;
    let roth = rothBalance;
    let brokerage = brokerageBalance;
    let basis = brokerageBasis;

    // Track historical MAGIs for 2-year lookback
    const magiTrack = {
        [startYear - 2]: magiHistory[0],
        [startYear - 1]: magiHistory[1],
        [startYear]: magiHistory[2]
    };

    // Main Simulation loop
    for (let age = startAge; age <= maxAge; age++) {
        const year = startYear + (age - startAge);
        const inflationYears = Math.max(0, year - startYear);

        // 1. Get Income Profile values (already in nominal dollars from profile, or inflated)
        const socialSecurity = parseProfile(ssProfile, year, 0);
        const pension = parseProfile(pensionProfile, year, 0);
        const baselineCapGains = parseProfile(capGainsProfile, year, 0);

        // 2. Pre-growth balances
        const prevIra = ira;
        const prevRoth = roth;
        const prevBrokerage = brokerage;

        // 3. RMD Calculation (Traditional IRA)
        const rmd = calculateRMD(age, ira, birthYear);

        // 4. Brokerage dividend/interest yield — taxable realized income this year
        const realizedDividends = brokerage * (dividendYield / 100);

        // 5. Total baseline ordinary income — dividends are capital-gains taxed, NOT ordinary income
        //    so only pension + RMD go here. Dividends flow through realizedCapGains below.
        const baseOrdinaryIncome = pension + rmd;

        // 6. Conversions scheduled for this year
        const conversionAmt = conversions[year] || 0;

        // 7. Calculate baseline taxes (before any extra withdrawals to pay for them)
        const lookbackMAGI = magiTrack[year - 2] || magiTrack[startYear]; // fallback
        
        let taxRes = calculateAnnualTaxes({
            year,
            filingStatus,
            ordinaryIncome: baseOrdinaryIncome,
            socialSecurity,
            realizedCapGains: baselineCapGains + realizedDividends, // dividends taxed as qualified cap gains
            conversionAmount: conversionAmt,
            state,
            inflationRate: inflationRate / 100,
            startYear,
            magi2YearsPrior: lookbackMAGI
        });

        // 8. Cash Flow solver: pay the tax bill from Brokerage first, then IRA, then Roth.
        let cashDeficit = taxRes.totalTax;

        // Withdraw conversion tax from Brokerage if possible
        let extraRealizedGains = 0;
        if (cashDeficit > 0) {
            const brokerageWithdrawal = Math.min(brokerage, cashDeficit);
            brokerage -= brokerageWithdrawal;
            brokerage = Math.max(0, brokerage);
            
            // Realize embedded gains proportionally from the withdrawal
            if (brokerageWithdrawal > 0 && prevBrokerage > 0) {
                const gainsFraction = Math.max(0, (prevBrokerage - basis) / prevBrokerage);
                extraRealizedGains = brokerageWithdrawal * gainsFraction;
                basis = Math.max(0, basis - (brokerageWithdrawal * (1 - gainsFraction)));
            }
            
            cashDeficit -= brokerageWithdrawal;
        }

        // If brokerage withdrawal triggered additional realized gains, recalculate taxes
        if (extraRealizedGains > 0) {
            taxRes = calculateAnnualTaxes({
                year,
                filingStatus,
                ordinaryIncome: baseOrdinaryIncome,
                socialSecurity,
                realizedCapGains: baselineCapGains + realizedDividends + extraRealizedGains,
                conversionAmount: conversionAmt,
                state,
                inflationRate: inflationRate / 100,
                startYear,
                magi2YearsPrior: lookbackMAGI
            });
            cashDeficit = Math.max(0, taxRes.totalTax - (prevBrokerage - brokerage));
        }

        // If brokerage exhausted, fund remaining from IRA, then Roth (no additional tax modeled for simplicity)
        if (cashDeficit > 0) {
            if (ira >= cashDeficit) {
                ira -= cashDeficit;
                cashDeficit = 0;
            } else {
                cashDeficit -= ira;
                ira = 0;
                roth = Math.max(0, roth - cashDeficit);
                cashDeficit = 0;
            }
        }

        // 9. Execute conversion shift: Traditional IRA -> Roth IRA
        const actualConversion = Math.min(ira, conversionAmt);
        ira = Math.max(0, ira - actualConversion);
        roth += actualConversion;

        // 10. Record MAGI for future lookback
        magiTrack[year] = taxRes.agi;

        // 11. Apply annual growth to all accounts
        const growthRate = annualReturn / 100;
        
        // IRA and Roth grow tax-deferred/tax-free at full annualReturn
        ira = Math.max(0, ira * (1 + growthRate));
        roth = Math.max(0, roth * (1 + growthRate));

        // Brokerage grows at full annualReturn (dividends are modeled as reinvested,
        // the separate realizedDividends amount above just represents the taxable income event)
        if (brokerage > 0) {
            const appreciationAmt = brokerage * growthRate;
            brokerage += appreciationAmt;
            // Unrealized gains portion of appreciation increases embedded gain
            const unrealizedGainsFraction = Math.max(0, (brokerage - basis) / brokerage);
            basis += appreciationAmt * (1 - unrealizedGainsFraction);
        }
        brokerage = Math.max(0, brokerage);

        // Record year state
        const nominalNetWorth = ira + roth + brokerage;
        const adjustedNetWorth = (ira * (1 - iraDiscountRate / 100)) + roth + brokerage;

        years.push({
            year,
            age,
            balances: { ira, roth, brokerage },
            nominalNetWorth,
            adjustedNetWorth,
            conversionAmount: actualConversion,
            rmd,
            taxes: taxRes,
            socialSecurity,
            pension,
            dividends: realizedDividends,
            brokerageBasis: basis
        });
    }

    return years;
}
