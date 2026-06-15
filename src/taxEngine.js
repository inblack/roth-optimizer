/**
 * Roth Conversion Optimizer - Tax Engine
 * Models Federal and State brackets (inflated annually), RMD tables,
 * Social Security taxability, Capital Gains stacking, and Medicare IRMAA cliffs.
 */

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

const RMD_TABLE = {
    72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
    80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4,
    88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9
};

export function getInflatedValue(value, rate, years) {
    return value * Math.pow(1 + rate, years);
}

export function calculateRMD(age, balance, birthYear) {
    const rmdAge = birthYear >= 1960 ? 75 : 73;
    if (age < rmdAge) return 0;
    const factor = RMD_TABLE[age] || RMD_TABLE[95];
    return balance / factor;
}

export function calculateProgressiveTax(taxableIncome, brackets) {
    let tax = 0;
    for (const b of brackets) {
        if (taxableIncome > b.min) {
            const applicableAmt = Math.min(taxableIncome, b.max) - b.min;
            tax += applicableAmt * b.rate;
        }
    }
    return tax;
}

export function calculateTaxableSocialSecurity(provisionalIncome, socialSecurity, filingStatus) {
    const baseObj = filingStatus === 'mfj' ? { tier1: 32000, tier2: 44000 } : { tier1: 25000, tier2: 34000 };
    if (provisionalIncome <= baseObj.tier1) return 0;
    
    if (provisionalIncome <= baseObj.tier2) {
        return Math.min(0.5 * socialSecurity, 0.5 * (provisionalIncome - baseObj.tier1));
    }
    const excessTier1 = baseObj.tier2 - baseObj.tier1;
    const basicTaxable = Math.min(0.5 * excessTier1, 0.5 * socialSecurity);
    const heavyTaxable = 0.85 * (provisionalIncome - baseObj.tier2);
    return Math.min(0.85 * socialSecurity, basicTaxable + heavyTaxable);
}

export function calculateAnnualTaxes({
    year,
    filingStatus,
    ordinaryIncome,
    socialSecurity,
    realizedCapGains,
    conversionAmount,
    state,
    inflationRate,
    startYear,
    magi2YearsPrior
}) {
    const inflationYears = Math.max(0, year - 2026);
    const fedStandard = getInflatedValue(BASE_DATA_2026.federal.standardDeduction[filingStatus], inflationRate, inflationYears);

    // Iterative Solution for Social Security Drag Engine
    let taxableSS = 0;
    const agiWithoutSS = ordinaryIncome + realizedCapGains + conversionAmount;
    for (let i = 0; i < 5; i++) {
        const provisionalIncome = agiWithoutSS + taxableSS + (0.5 * socialSecurity);
        taxableSS = calculateTaxableSocialSecurity(provisionalIncome, socialSecurity, filingStatus);
    }

    const agi = ordinaryIncome + taxableSS + conversionAmount + realizedCapGains;
    const ordinaryTaxableAmount = Math.max(0, (ordinaryIncome + taxableSS + conversionAmount) - fedStandard);
    const totalTaxable = Math.max(0, agi - fedStandard);
    const gainsToTax = totalTaxable - ordinaryTaxableAmount;

    // Federal Ordinary Progression
    const fedBrackets = BASE_DATA_2026.federal[filingStatus].map(b => ({
        rate: b.rate,
        min: getInflatedValue(b.min, inflationRate, inflationYears),
        max: getInflatedValue(b.max, inflationRate, inflationYears)
    }));
    const fedTax = calculateProgressiveTax(ordinaryTaxableAmount, fedBrackets);

    // Capital Gains Stack Calculation
    let capGainsTax = 0;
    if (gainsToTax > 0) {
        const gainsBrackets = BASE_DATA_2026.capGains[filingStatus].map(b => ({
            rate: b.rate,
            min: getInflatedValue(b.min, inflationRate, inflationYears),
            max: getInflatedValue(b.max, inflationRate, inflationYears)
        }));
        const taxOnTotal = calculateProgressiveTax(totalTaxable, gainsBrackets);
        const taxOnOrdinary = calculateProgressiveTax(ordinaryTaxableAmount, gainsBrackets);
        capGainsTax = Math.max(0, taxOnTotal - taxOnOrdinary);
    }

    // State Computations
    let stateTax = 0;
    if (BASE_DATA_2026.state[state]) {
        const stateStandard = getInflatedValue(BASE_DATA_2026.state[state].standardDeduction, inflationRate, inflationYears);
        const stateBrackets = BASE_DATA_2026.state[state][filingStatus === 'mfj' ? 'mfj' : 'single']?.map(b => ({
            rate: b.rate,
            min: getInflatedValue(b.min, inflationRate, inflationYears),
            max: getInflatedValue(b.max, inflationRate, inflationYears)
        })) || [];
        stateTax = calculateProgressiveTax(Math.max(0, agi - stateStandard), stateBrackets);
    } else if (state === 'PA') {
        stateTax = agi * 0.0307;
    } else if (state === 'NC') {
        stateTax = agi * 0.045;
    }

    // Medicare IRMAA Surcharge Processing
    const irmaaBrackets = BASE_DATA_2026.irmaa[filingStatus].map(b => ({
        limit: getInflatedValue(b.limit, inflationRate, inflationYears),
        surcharge: b.surcharge
    }));

    let irmaaCost = 0;
    for (const tier of irmaaBrackets) {
        if (magi2YearsPrior <= tier.limit) {
            irmaaCost = tier.surcharge;
            break;
        }
    }

    const totalTax = fedTax + capGainsTax + stateTax + irmaaCost;

    return {
        totalTax,
        fedTax: fedTax + capGainsTax,
        stateTax,
        irmaaCost,
        agi,
        taxableSS
    };
}