/**
 * Roth Conversion Optimizer - Tax Engine
 * Models Federal and State brackets (inflated annually), RMD tables,
 * Social Security taxability, Capital Gains stacking, and Medicare IRMAA cliffs.
 */

// 2026 base tax bracket rates and bounds (subject to inflation indexation)
export const BASE_DATA_2026 = {
    federal: {
        single: [
            { rate: 0.10, min: 0, max: 11600 },
            { rate: 0.12, min: 11600, max: 47150 },
            { rate: 0.22, min: 47150, max: 100525 },
            { rate: 0.24, min: 100525, max: 191950 },
            { rate: 0.32, min: 191950, max: 243725 },
            { rate: 0.35, min: 243725, max: 609350 },
            { rate: 0.37, min: 609350, max: Infinity }
        ],
        mfj: [
            { rate: 0.10, min: 0, max: 23200 },
            { rate: 0.12, min: 23200, max: 94300 },
            { rate: 0.22, min: 94300, max: 201050 },
            { rate: 0.24, min: 201050, max: 383900 },
            { rate: 0.32, min: 383900, max: 487450 },
            { rate: 0.35, min: 487450, max: 731200 },
            { rate: 0.37, min: 731200, max: Infinity }
        ],
        standardDeduction: { single: 15000, mfj: 30000 }
    },
    capGains: {
        single: [
            { rate: 0.00, min: 0, max: 49200 },
            { rate: 0.15, min: 49200, max: 541200 },
            { rate: 0.20, min: 541200, max: Infinity }
        ],
        mfj: [
            { rate: 0.00, min: 0, max: 98400 },
            { rate: 0.15, min: 98400, max: 608900 },
            { rate: 0.20, min: 608900, max: Infinity }
        ]
    },
    irmaa: {
        // Base MAGI thresholds for 2 years prior
        // Note: Surcharges are calculated annually (monthly surcharge * 12)
        single: [
            { limit: 106000, surcharge: 0 },
            { limit: 133000, surcharge: 70 * 12 },
            { limit: 166000, surcharge: 180 * 12 },
            { limit: 199000, surcharge: 280 * 12 },
            { limit: 500000, surcharge: 390 * 12 },
            { limit: Infinity, surcharge: 420 * 12 }
        ],
        mfj: [
            { limit: 212000, surcharge: 0 },
            { limit: 266000, surcharge: 70 * 12 },
            { limit: 332000, surcharge: 180 * 12 },
            { limit: 398000, surcharge: 280 * 12 },
            { limit: 750000, surcharge: 390 * 12 },
            { limit: Infinity, surcharge: 420 * 12 }
        ]
    },
    state: {
        CA: {
            single: [
                { rate: 0.01, min: 0, max: 10412 },
                { rate: 0.02, min: 10412, max: 24684 },
                { rate: 0.04, min: 24684, max: 38959 },
                { rate: 0.06, min: 38959, max: 54081 },
                { rate: 0.08, min: 54081, max: 68350 },
                { rate: 0.093, min: 68350, max: 349137 },
                { rate: 0.103, min: 349137, max: 418961 },
                { rate: 0.113, min: 418961, max: 698271 },
                { rate: 0.123, min: 698271, max: Infinity }
            ],
            standardDeduction: 5363
        },
        NY: {
            single: [
                { rate: 0.04, min: 0, max: 8500 },
                { rate: 0.045, min: 8500, max: 11700 },
                { rate: 0.0525, min: 11700, max: 13900 },
                { rate: 0.055, min: 13900, max: 21400 },
                { rate: 0.06, min: 21400, max: 80650 },
                { rate: 0.0625, min: 80650, max: 215400 },
                { rate: 0.0685, min: 215400, max: 1077550 },
                { rate: 0.0965, min: 1077550, max: 5000000 },
                { rate: 0.109, min: 5000000, max: Infinity }
            ],
            standardDeduction: 8000
        }
    }
};

// IRS RMD Uniform Lifetime Table
const RMD_TABLE = {
    72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
    80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4,
    88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9,
    96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4
};

/**
 * Calculates RMD based on age and previous year Dec 31 balance.
 */
export function calculateRMD(age, balance, birthYear) {
    // SECURE Act 2.0 rules
    const rmdAge = birthYear >= 1960 ? 75 : 73;
    if (age < rmdAge) return 0;
    const factor = RMD_TABLE[age] || RMD_TABLE[100];
    return balance / factor;
}

/**
 * Helper to inflate a bracket table or deduction amount
 */
export function getInflatedValue(value, inflationRate, years) {
    if (value === Infinity) return Infinity;
    return value * Math.pow(1 + inflationRate, years);
}

/**
 * Computes progressive tax for a set of brackets
 */
function calculateProgressiveTax(taxableIncome, brackets) {
    if (taxableIncome <= 0) return 0;
    let tax = 0;
    for (const bracket of brackets) {
        if (taxableIncome > bracket.min) {
            const width = Math.min(taxableIncome, bracket.max) - bracket.min;
            tax += width * bracket.rate;
        } else {
            break;
        }
    }
    return tax;
}

/**
 * Exact IRS Social Security Taxability Calculation Worksheet
 */
export function calculateTaxableSocialSecurity(provisionalIncome, ssBenefit, filingStatus) {
    const threshold1 = filingStatus === 'mfj' ? 32000 : 25000;
    const threshold2 = filingStatus === 'mfj' ? 44000 : 34000;
    const max50Benefit = 0.5 * ssBenefit;
    const max85Benefit = 0.85 * ssBenefit;

    if (provisionalIncome <= threshold1) {
        return 0;
    }

    if (provisionalIncome <= threshold2) {
        return Math.min(max50Benefit, 0.5 * (provisionalIncome - threshold1));
    }

    // Over threshold2
    const baseAmount = Math.min(filingStatus === 'mfj' ? 6000 : 4500, max50Benefit);
    const addedAmount = 0.85 * (provisionalIncome - threshold2);
    return Math.min(max85Benefit, baseAmount + addedAmount);
}

/**
 * High-precision year calculation for Federal, State, IRMAA, and CapGains.
 */
export function calculateAnnualTaxes({
    year,
    filingStatus,
    ordinaryIncome, // pension + RMD + other ordinary (excl. SS, CapGains, Conversions)
    socialSecurity,
    realizedCapGains,
    conversionAmount,
    state,
    inflationRate,
    startYear,
    magi2YearsPrior // input from MAGI history
}) {
    const inflationYears = Math.max(0, year - 2026);
    
    // Inflate Federal Standard Deduction and Brackets
    const fedStandard = getInflatedValue(BASE_DATA_2026.federal.standardDeduction[filingStatus], inflationRate, inflationYears);
    const fedBrackets = BASE_DATA_2026.federal[filingStatus].map(b => ({
        rate: b.rate,
        min: getInflatedValue(b.min, inflationRate, inflationYears),
        max: getInflatedValue(b.max, inflationRate, inflationYears)
    }));

    // Step 1: Iterative solution for Social Security taxability
    // Because Taxable SS is part of AGI, which is part of Provisional Income, we iterate to find the steady state.
    let taxableSS = 0;
    let agiWithoutSS = ordinaryIncome + realizedCapGains + conversionAmount;
    let maxIterations = 5;
    for (let i = 0; i < maxIterations; i++) {
        // Provisional Income = AGI without SS + 50% of SS
        const provisionalIncome = agiWithoutSS + (0.5 * socialSecurity);
        taxableSS = calculateTaxableSocialSecurity(provisionalIncome, socialSecurity, filingStatus);
    }

    // Step 2: Calculate AGI
    const agi = ordinaryIncome + taxableSS + realizedCapGains + conversionAmount;
    const ordinaryTaxable = Math.max(0, (ordinaryIncome + taxableSS + conversionAmount) - fedStandard);

    // Step 3: Progressive Ordinary Federal Income Tax
    const fedOrdinaryTax = calculateProgressiveTax(ordinaryTaxable, fedBrackets);

    // Step 4: Capital Gains Stacked Tax (stacking realizedCapGains on top of ordinaryTaxable)
    const gainsBrackets = BASE_DATA_2026.capGains[filingStatus].map(b => ({
        rate: b.rate,
        min: getInflatedValue(b.min, inflationRate, inflationYears),
        max: getInflatedValue(b.max, inflationRate, inflationYears)
    }));

    let capGainsTax = 0;
    if (realizedCapGains > 0) {
        // Stacked calculations
        const totalTaxable = ordinaryTaxable + realizedCapGains;
        const taxOnTotal = calculateProgressiveTax(totalTaxable, gainsBrackets);
        const taxOnOrdinary = calculateProgressiveTax(ordinaryTaxable, gainsBrackets);
        capGainsTax = Math.max(0, taxOnTotal - taxOnOrdinary);
    }

    // Step 5: State Taxes
    let stateTax = 0;
    if (state !== 'FED_ONLY') {
        const stateConfig = BASE_DATA_2026.state[state];
        if (stateConfig) {
            // Progressive State Tax (CA / NY)
            const stateStandard = getInflatedValue(stateConfig.standardDeduction, inflationRate, inflationYears);
            const stateBrackets = stateConfig.single.map(b => ({
                rate: b.rate,
                min: getInflatedValue(b.min, inflationRate, inflationYears),
                max: getInflatedValue(b.max, inflationRate, inflationYears)
            }));
            const stateTaxable = Math.max(0, agi - stateStandard);
            stateTax = calculateProgressiveTax(stateTaxable, stateBrackets);
        } else if (state === 'PA') {
            // Flat 3.07% on AGI (Pennsylvania)
            stateTax = agi * 0.0307;
        } else if (state === 'NC') {
            // Flat 4.5% on AGI (North Carolina)
            stateTax = agi * 0.045;
        }
    }

    // Step 6: Medicare IRMAA Surcharges (based on MAGI from 2 years prior)
    // MAGI = AGI (standard deduction is NOT subtracted for IRMAA)
    const irmaaBrackets = BASE_DATA_2026.irmaa[filingStatus].map(b => ({
        limit: getInflatedValue(b.limit, inflationRate, inflationYears),
        surcharge: b.surcharge // surcharges themselves typically inflate, but we keep flat premium add-on structure
    }));

    let irmaaCost = 0;
    const lookupMAGI = magi2YearsPrior;
    for (const tier of irmaaBrackets) {
        if (lookupMAGI <= tier.limit) {
            irmaaCost = tier.surcharge;
            break;
        }
    }

    // Totals
    const totalTax = fedOrdinaryTax + capGainsTax + stateTax + irmaaCost;

    return {
        fedOrdinaryTax,
        capGainsTax,
        stateTax,
        irmaaCost,
        totalTax,
        taxableSS,
        agi,
        ordinaryTaxable
    };
}
