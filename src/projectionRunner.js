import { calculateRMD, calculateAnnualTaxes } from './taxEngine.js';

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
    livingExpensesProfile,
    magiHistory,
    conversions = {}
}) {
    const years = [];
    const maxAge = 95;
    const startAge = currentAge;
    
    let ira = iraBalance;
    let roth = rothBalance;
    let brokerage = brokerageBalance;
    let basis = brokerageBasis;

    const magiTrack = {
        [startYear - 2]: magiHistory[0],
        [startYear - 1]: magiHistory[1],
        [startYear]: magiHistory[2]
    };

    for (let age = startAge; age <= maxAge; age++) {
        const year = startYear + (age - startAge);
        const rateDecimal = inflationRate / 100;

        const socialSecurity = parseProfile(ssProfile, year, 0);
        const pension = parseProfile(pensionProfile, year, 0);
        const baselineCapGains = parseProfile(capGainsProfile, year, 0);
        const livingExpenses = parseProfile(livingExpensesProfile, year, 0);

        const prevIra = ira;
        const prevRoth = roth;
        const prevBrokerage = brokerage;

        const rmd = calculateRMD(age, ira, birthYear);
        const realizedDividends = brokerage * (dividendYield / 100);
        const baseOrdinaryIncome = pension + rmd;
        const conversionAmt = conversions[year] || 0;

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
            conversionAmount: conversionAmt,
            state,
            inflationRate: rateDecimal,
            startYear,
            magi2YearsPrior: lookbackMAGI
        });

        const cashInflows = pension + socialSecurity + realizedDividends + baselineCapGains + rmd;
        let cashDeficit = livingExpenses + taxRes.totalTax - cashInflows;
        let surplus = 0;
        let extraRealizedGains = 0;

        if (cashDeficit < 0) {
            surplus = -cashDeficit;
            brokerage += surplus;
            basis += surplus;
            cashDeficit = 0;
        } else if (cashDeficit > 0) {
            const brokerageWithdrawal = Math.min(brokerage, cashDeficit);
            brokerage -= brokerageWithdrawal;
            if (brokerageWithdrawal > 0 && prevBrokerage > 0) {
                const gainsFraction = Math.max(0, (prevBrokerage - basis) / prevBrokerage);
                extraRealizedGains = brokerageWithdrawal * gainsFraction;
                basis = Math.max(0, basis - (brokerageWithdrawal * (1 - gainsFraction)));
            }
            cashDeficit -= brokerageWithdrawal;

            if (extraRealizedGains > 0) {
                taxRes = calculateAnnualTaxes({
                    year,
                    filingStatus,
                    ordinaryIncome: baseOrdinaryIncome,
                    socialSecurity,
                    realizedCapGains: baselineCapGains + realizedDividends + extraRealizedGains,
                    conversionAmount: conversionAmt,
                    state,
                    inflationRate: rateDecimal,
                    startYear,
                    magi2YearsPrior: lookbackMAGI
                });
                cashDeficit = livingExpenses + taxRes.totalTax - (cashInflows + extraRealizedGains);
                if (cashDeficit > 0) {
                    const extraSecDraw = Math.min(brokerage, cashDeficit);
                    brokerage -= extraSecDraw;
                    cashDeficit -= extraSecDraw;
                }
            }
        }

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

        ira = Math.max(0, ira - conversionAmt);
        roth = Math.max(0, roth + conversionAmt);

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
            const unrealizedGainsFraction = Math.max(0, (brokerage - basis) / brokerage);
            basis += brokerageGrowth * (1 - unrealizedGainsFraction);
        }
        brokerage = Math.max(0, brokerage);

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
            brokerageBasis: basis,
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