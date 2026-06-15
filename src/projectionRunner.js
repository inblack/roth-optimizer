import { calculateRMD, calculateAnnualTaxes } from './taxEngine.js';

export function parseProfile(profileStr, targetYear, defaultValue = 0) {
    if (!profileStr) return defaultValue;
    
    // Safety check: if string doesn't contain parentheses, treat it as a raw number if valid, or return 0
    if (!profileStr.includes('(')) {
        const parsed = parseFloat(profileStr);
        return isNaN(parsed) ? defaultValue : parsed;
    }
    
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
    taxFreeShield,
    annualReturn,
    dividendYield,
    inflationRate,
    iraDiscountRate,
    ssProfile,
    pensionProfile,
    capGainsProfile,
    livingExpensesProfile,
    magiHistory,
    conversions = {}
}) {
    // TRANSLATOR BLOCK: Intercept friendly HTML dropdown strings and turn them into parseable timeline expressions
    let processedSS = ssProfile;
    if (ssProfile === 'standard') processedSS = `(${startYear + (67 - currentAge)}-) 45000`;
    if (ssProfile === 'delayed') processedSS = `(${startYear + (70 - currentAge)}-) 55000`;
    if (ssProfile === 'none') processedSS = `(${startYear}-) 0`;

    let processedPension = pensionProfile;
    if (pensionProfile === 'none') processedPension = `(${startYear}-) 0`;
    if (pensionProfile === 'standard') processedPension = `(${startYear + (65 - currentAge)}-) 25000`;

    let processedExpenses = livingExpensesProfile;
    if (livingExpensesProfile === 'standard') processedExpenses = `(${startYear}-) 85000`;

    const years = [];
    const maxAge = 95;
    const startAge = currentAge;
    
    let ira = iraBalance;
    let roth = rothBalance;
    let brokerage = brokerageBalance;
    
    // Maintain a single dynamic pool for our tax-free liquidity shield runway
    let activeShieldRunway = taxFreeShield;

    const magiTrack = {
        [startYear - 2]: magiHistory[0],
        [startYear - 1]: magiHistory[1],
        [startYear]: magiHistory[2]
    };

    for (let age = startAge; age <= maxAge; age++) {
        const year = startYear + (age - startAge);
        const rateDecimal = inflationRate / 100;

        const socialSecurity = parseProfile(processedSS, year, 0);
        const pension = parseProfile(processedPension, year, 0);
        const baselineCapGains = parseProfile(capGainsProfile, year, 0);
        const livingExpenses = parseProfile(processedExpenses, year, 0);

        const prevIra = ira;
        const prevRoth = roth;
        const prevBrokerage = brokerage;

        // FIXED: Shifting conversion amounts at the very top of the execution timeline frame
        let conversionAmt = conversions[year] || 0;
        if (conversionAmt > ira) {
            conversionAmt = ira;
        }
        
        ira = Math.max(0, ira - conversionAmt);
        roth = Math.max(0, roth + conversionAmt);

        const rmd = calculateRMD(age, ira, birthYear);
        const realizedDividends = brokerage * (dividendYield / 100);
        
        // Base ordinary income safely reflects our top-of-loop conversion addition
        const baseOrdinaryIncome = pension + rmd + conversionAmt;

        let lookbackMAGI = magiTrack[year - 2];
        if (lookbackMAGI === undefined) {
            if (year === startYear) lookbackMAGI = magiHistory[0];
            else if (year === startYear + 1) lookbackMAGI = magiHistory[1];
            else lookbackMAGI = magiHistory[2];
        }
        
        let taxRes = calculateAnnualTaxes({
            year,
            filingStatus,
            ordinaryIncome: baseOrdinaryIncome,
            socialSecurity,
            realizedCapGains: baselineCapGains + realizedDividends,
            conversionAmount: 0, 
            state,
            inflationRate: rateDecimal,
            startYear,
            magi2YearsPrior: lookbackMAGI
        });

        const cashInflows = pension + socialSecurity + realizedDividends + baselineCapGains + rmd;
        let cashDeficit = livingExpenses + taxRes.totalTax - cashInflows;
        let surplus = 0;
        let taxableGainsFromSale = 0;

        if (cashDeficit < 0) {
            surplus = -cashDeficit;
            brokerage += surplus;
            // Any unused annual savings replenish the liquidity shield pool buffer
            activeShieldRunway += surplus; 
            cashDeficit = 0;
        } else if (cashDeficit > 0) {
            const brokerageWithdrawal = Math.min(brokerage, cashDeficit);
            brokerage -= brokerageWithdrawal;
            
            // Waterfall Layer 1: Spend from our tax-free liquidity shield completely tax-free
            if (activeShieldRunway >= brokerageWithdrawal) {
                activeShieldRunway -= brokerageWithdrawal;
                taxableGainsFromSale = 0;
            } else {
                // Waterfall Layer 2: Shield pool is empty. Fallback to standard 30% capital gains realization.
                const unshieldedAmount = brokerageWithdrawal - activeShieldRunway;
                activeShieldRunway = 0;
                taxableGainsFromSale = unshieldedAmount * 0.30;
            }
            
            cashDeficit -= brokerageWithdrawal;

            // Recalculate tax return only if we completely broke out of our tax shields
            if (taxableGainsFromSale > 0) {
                taxRes = calculateAnnualTaxes({
                    year,
                    filingStatus,
                    ordinaryIncome: baseOrdinaryIncome,
                    socialSecurity,
                    realizedCapGains: baselineCapGains + realizedDividends + taxableGainsFromSale,
                    conversionAmount: 0,
                    state,
                    inflationRate: rateDecimal,
                    startYear,
                    magi2YearsPrior: lookbackMAGI
                });
                cashDeficit = livingExpenses + taxRes.totalTax - (cashInflows + taxableGainsFromSale);
                if (cashDeficit > 0) {
                    const extraDraw = Math.min(brokerage, cashDeficit);
                    brokerage -= extraDraw;
                    cashDeficit -= extraDraw;
                }
            }
        }

        // Secondary emergency safety withdrawal checks if taxable cash completely empties
        let extraIraWithdrawal = 0;
        if (cashDeficit > 0) {
            extraIraWithdrawal = Math.min(ira, cashDeficit);
            ira -= extraIraWithdrawal;
            cashDeficit -= extraIraWithdrawal;
        }

        let extraRothWithdrawal = 0;
        if (cashDeficit > 0) {
            extraRothWithdrawal = Math.min(roth, cashDeficit);
            roth -= extraRothWithdrawal;
            cashDeficit -= extraRothWithdrawal;
        }

        magiTrack[year] = taxRes.agi;

        const growthRate = annualReturn / 100;
        const iraGrowth = ira * growthRate;
        const rothGrowth = roth * growthRate;
        ira = Math.max(0, ira + iraGrowth);
        roth = Math.max(0, roth + rothGrowth);

        let brokerageGrowth = 0;
        if (brokerage > 0) {
            brokerageGrowth = brokerage * growthRate;
            brokerage += brokerageGrowth;
        }

        const nominalNetWorth = ira + roth + brokerage;
        const adjustedNetWorth = (ira * (1 - iraDiscountRate / 100)) + roth + brokerage;

        years.push({
            year,
            age,
            balances: { ira, roth, brokerage },
            growth: { ira: iraGrowth, roth: rothGrowth, brokerage: brokerageGrowth },
            nominalNetWorth,
            adjustedNetWorth,
            conversionAmount: conversionAmt,
            rmd,
            taxes: taxRes,
            socialSecurity,
            pension,
            dividends: realizedDividends,
            livingExpenses,
            surplus,
            cashInflows,
            extraWithdrawals: {
                brokerage: Math.max(0, prevBrokerage - brokerage + surplus),
                ira: extraIraWithdrawal,
                roth: extraRothWithdrawal
            }
        });
    }

    return years;
}