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
    let basis = brokerageBasis;

    const magiTrack = {
        minus2: magiHistory[0] || 0,
        minus1: magiHistory[1] || 0
    };

    for (let year = startYear; year <= startYear + (maxAge - startAge); year++) {
        const age = startAge + (year - startYear);
        const inflationYears = year - startYear;

        // Parse using normalized string formulas
        const socialSecurity = parseProfile(processedSS, year, 0);
        const pension = parseProfile(processedPension, year, 0);
        const livingExpenses = parseProfile(processedExpenses, year, 0);
        
        // ... remainder of your existing projection runner file calculations ...