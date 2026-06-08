import { runProjection } from './projectionRunner.js';
import { BASE_DATA_2026, getInflatedValue } from './taxEngine.js';

/**
 * Finds the optimal Roth conversion schedule to maximize ending Adjusted Net Worth.
 * Uses a hybrid approach:
 * 1. Coarse search over standard bracket-filling tiers.
 * 2. Fine-tuning local search using coordinate descent.
 */
export function optimizeRothConversions(params) {
    const startYear = params.startYear;
    const currentAge = params.currentAge;
    const maxAge = 95;
    const numYears = maxAge - currentAge + 1;
    const endYear = startYear + numYears - 1;

    // We only optimize conversions from startAge up to RMD age (typically age 75) or max age 85
    const rmdAge = params.birthYear >= 1960 ? 75 : 73;
    const maxOptimizeAge = Math.min(85, rmdAge + 5);

    // Initial baseline projection (No Conversions)
    const baselineConversions = {};
    const baselineResult = runProjection({ ...params, conversions: baselineConversions });
    const baselineScore = baselineResult[baselineResult.length - 1].adjustedNetWorth;

    let bestScore = baselineScore;
    let bestConversions = { ...baselineConversions };

    // --- STEP 1: Bracket Filling Search ---
    // Test standard bracket filling targets: 12% (15% post-TCJA approx), 22%, 24%, 32%
    // We compute the target taxable income limit each year and fill conversions up to it.
    const standardRates = [0.10, 0.12, 0.22, 0.24, 0.32];
    
    for (const targetRate of standardRates) {
        const candidateConversions = {};
        
        // Run a simulation year-by-year, dynamically filling up to the bracket for that year
        let tempIra = params.iraBalance;
        let tempBrokerage = params.brokerageBalance;
        let tempBasis = params.brokerageBasis;
        
        for (let age = currentAge; age < maxOptimizeAge; age++) {
            const year = startYear + (age - currentAge);
            const inflationYears = Math.max(0, year - 2026);
            
            // Get target bracket limit
            const fedBrackets = BASE_DATA_2026.federal[params.filingStatus];
            const matchingBracket = fedBrackets.find(b => Math.abs(b.rate - targetRate) < 0.005) || fedBrackets[1];
            const maxIncome = getInflatedValue(matchingBracket.max, params.inflationRate / 100, inflationYears);
            const standardDeduction = getInflatedValue(BASE_DATA_2026.federal.standardDeduction[params.filingStatus], params.inflationRate / 100, inflationYears);

            // Estimate other ordinary income (Pension + RMD approx)
            const rmd = calculateRmdApproximation(age, tempIra, params.birthYear);
            const pension = 24000; // default pension fallback
            const estimatedOtherIncome = pension + rmd - standardDeduction;

            // Room for conversion
            const room = Math.max(0, maxIncome - estimatedOtherIncome);
            const conversion = Math.min(tempIra, room, tempBrokerage * 0.9); // keep some brokerage for tax payments
            
            candidateConversions[year] = conversion;
            
            // Rough balance update to keep estimates reasonable
            tempIra = Math.max(0, tempIra - conversion) * (1 + params.annualReturn / 100);
            tempBrokerage = Math.max(0, tempBrokerage - (conversion * 0.22)) * (1 + params.annualReturn / 100); // assume 22% tax cost
        }

        // Test this candidate schedule
        const res = runProjection({ ...params, conversions: candidateConversions });
        const score = res[res.length - 1].adjustedNetWorth;
        
        if (score > bestScore) {
            bestScore = score;
            bestConversions = { ...candidateConversions };
        }
    }

    // --- STEP 2: Coordinate Descent Fine-Tuning ---
    // Perform local searches by perturbing conversion amounts in each eligible year
    let improved = true;
    let iterations = 0;
    const maxIterations = 3; // Keep optimizer fast (<30ms)
    const stepSizes = [50000, 20000, 10000]; // Multi-grid step sizes

    while (improved && iterations < maxIterations) {
        improved = false;
        const step = stepSizes[iterations];

        for (let age = currentAge; age < maxOptimizeAge; age++) {
            const year = startYear + (age - currentAge);
            const currentVal = bestConversions[year] || 0;

            // Test adding step
            const testAddConversions = { ...bestConversions, [year]: Math.max(0, currentVal + step) };
            const addRes = runProjection({ ...params, conversions: testAddConversions });
            const addScore = addRes[addRes.length - 1].adjustedNetWorth;

            if (addScore > bestScore + 100) { // must improve by more than $100
                bestScore = addScore;
                bestConversions = testAddConversions;
                improved = true;
                continue;
            }

            // Test subtracting step
            if (currentVal > 0) {
                const testSubConversions = { ...bestConversions, [year]: Math.max(0, currentVal - step) };
                const subRes = runProjection({ ...params, conversions: testSubConversions });
                const subScore = subRes[subRes.length - 1].adjustedNetWorth;

                if (subScore > bestScore + 100) {
                    bestScore = subScore;
                    bestConversions = testSubConversions;
                    improved = true;
                }
            }
        }
        iterations++;
    }

    // Ensure all values are rounded to nearest $1,000 for clean UI display
    for (const year in bestConversions) {
        bestConversions[year] = Math.round(bestConversions[year] / 1000) * 1000;
    }

    return {
        conversions: bestConversions,
        score: bestScore
    };
}

/**
 * Simple RMD factor estimation for the optimizer search
 */
function calculateRmdApproximation(age, balance, birthYear) {
    const rmdAge = birthYear >= 1960 ? 75 : 73;
    if (age < rmdAge) return 0;
    const factor = (95 - age) || 1; // rough linear life expectancy divisor
    return balance / factor;
}
