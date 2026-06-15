import { runProjection, parseProfile } from './projectionRunner.js';
import { BASE_DATA_2026, getInflatedValue } from './taxEngine.js';

export function optimizeRothConversions(params) {
    const startYear = params.startYear;
    const currentAge = params.currentAge;
    const maxAge = 95;
    const numYears = maxAge - currentAge + 1;

    const rmdAge = params.birthYear >= 1960 ? 75 : 73;
    const maxOptimizeAge = Math.min(85, rmdAge + 5);

    const baselineConversions = {};
    const baselineResult = runProjection({ ...params, conversions: baselineConversions });
    const baselineScore = baselineResult[baselineResult.length - 1].adjustedNetWorth;

    let bestScore = baselineScore;
    let bestConversions = { ...baselineConversions };

    const targets = [
        { type: 'rate', value: 0.10 },
        { type: 'rate', value: 0.12 },
        { type: 'rate', value: 0.22 },
        { type: 'rate', value: 0.24 },
        { type: 'rate', value: 0.32 },
        { type: 'rate', value: 0.35 },
        { type: 'irmaa', index: 0 },
        { type: 'irmaa', index: 1 },
        { type: 'irmaa', index: 2 },
        { type: 'irmaa', index: 3 },
        { type: 'irmaa', index: 4 }
    ];
    
    const rateDecimal = params.inflationRate / 100;

    for (const target of targets) {
        const candidateConversions = {};
        let tempIra = params.iraBalance;
        
        for (let age = currentAge; age < maxOptimizeAge; age++) {
            const year = startYear + (age - currentAge);
            const inflationYears = Math.max(0, year - 2026);
            
            const standardDeduction = getInflatedValue(BASE_DATA_2026.federal.standardDeduction[params.filingStatus], rateDecimal, inflationYears);
            let targetAGI = 0;

            if (target.type === 'rate') {
                const fedBrackets = BASE_DATA_2026.federal[params.filingStatus];
                const matchingBracket = fedBrackets.find(b => Math.abs(b.rate - target.value) < 0.005) || fedBrackets[1];
                const maxIncome = getInflatedValue(matchingBracket.max, rateDecimal, inflationYears);
                targetAGI = maxIncome + standardDeduction;
            } else if (target.type === 'irmaa') {
                const irmaaBrackets = BASE_DATA_2026.irmaa[params.filingStatus];
                const limit = irmaaBrackets[target.index].limit;
                targetAGI = getInflatedValue(limit, rateDecimal, inflationYears);
            }

            const pension = parseProfile(params.pensionProfile, year, 0);
            const rmd = tempIra / (95 - age + 5); 
            const estimatedCurrentAGI = pension + rmd;

            let conversionAmt = Math.max(0, targetAGI - estimatedCurrentAGI);
            conversionAmt = Math.min(tempIra, conversionAmt);

            if (conversionAmt > 5000) {
                candidateConversions[year] = Math.round(conversionAmt / 1000) * 1000;
                tempIra = Math.max(0, tempIra - conversionAmt);
            }
            tempIra *= (1 + params.annualReturn / 100);
        }

        const candRes = runProjection({ ...params, conversions: candidateConversions });
        const candScore = candRes[candRes.length - 1].adjustedNetWorth;

        if (candScore > bestScore) {
            bestScore = candScore;
            bestConversions = candidateConversions;
        }
    }

    // Coordinate Descent Fine Tuning
    let improved = true;
    let iterations = 0;
    const step = 10000;

    while (improved && iterations < 3) {
        improved = false;
        for (let age = currentAge; age < maxOptimizeAge; age++) {
            const year = startYear + (age - currentAge);
            const currentVal = bestConversions[year] || 0;

            // Add testing
            const testAddConversions = { ...bestConversions, [year]: currentVal + step };
            const addRes = runProjection({ ...params, conversions: testAddConversions });
            const addScore = addRes[addRes.length - 1].adjustedNetWorth;

            if (addScore > bestScore + 100) {
                bestScore = addScore;
                bestConversions = testAddConversions;
                improved = true;
                continue;
            }

            // Subtract testing
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

    for (const year in bestConversions) {
        bestConversions[year] = Math.round(bestConversions[year] / 1000) * 1000;
    }

    return {
        conversions: bestConversions,
        score: bestScore
    };
}