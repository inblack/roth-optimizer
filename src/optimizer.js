import { runProjection, parseProfile } from './projectionRunner.js';
import { BASE_DATA_2026, getInflatedValue } from './taxEngine.js';

export function optimizeRothConversions(params) {
    const startYear = params.startYear;
    const currentAge = params.currentAge;
    const maxAge = 95;

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

    // TRANSLATOR BLOCK: Match friendly selection dropdown labels to runtime evaluation strings
    let processedPension = params.pensionProfile;
    if (params.pensionProfile === 'none') processedPension = `(${startYear}-) 0`;
    if (params.pensionProfile === 'standard') processedPension = `(${startYear + (65 - currentAge)}-) 25000`;

    // Phase 1: Macro Boundary Target Brackets Matrix Sweep Loops
    for (const target of targets) {
        const candidateConversions = {};
        let tempIra = params.iraBalance;

        for (let age = currentAge; age < maxOptimizeAge; age++) {
            const year = startYear + (age - currentAge);
            const inflationYears = year - startYear;

            const pension = parseProfile(processedPension, year, 0);
            const rmd = tempIra / (95 - age + 5); 
            const estimatedCurrentAGI = pension + rmd;

            let targetAGI = 0;
            if (target.type === 'rate') {
                const fedBrackets = BASE_DATA_2026.federal[params.filingStatus === 'mfj' ? 'mfj' : 'single'];
                const bracketIndex = fedBrackets.findIndex(b => b.rate === target.value);
                const targetBracket = fedBrackets[bracketIndex >= 0 ? bracketIndex : 1];
                const baseStandardDeduction = params.filingStatus === 'mfj' ? 30000 : 15000;

                targetAGI = getInflatedValue(targetBracket.max, params.inflationRate / 100, inflationYears) +
                            getInflatedValue(baseStandardDeduction, params.inflationRate / 100, inflationYears);
            } else if (target.type === 'irmaa') {
                const irmaaBrackets = BASE_DATA_2026.irmaa[params.filingStatus];
                const targetTier = irmaaBrackets[Math.min(target.index, irmaaBrackets.length - 1)];
                targetAGI = getInflatedValue(targetTier.limit, params.inflationRate / 100, inflationYears) - 100;
            }

            let conversionAmt = Math.max(0, targetAGI - estimatedCurrentAGI);
            
            if (conversionAmt > 5000) {
                candidateConversions[year] = Math.round(conversionAmt / 1000) * 1000;
                tempIra = Math.max(0, tempIra - conversionAmt);
            }
        }

        const res = runProjection({ ...params, conversions: candidateConversions });
        if (res.length > 0) {
            const score = res[res.length - 1].adjustedNetWorth;
            if (score > bestScore) {
                bestScore = score;
                bestConversions = candidateConversions;
            }
        }
    }

    // Phase 2: Micro-Directional Step Refinement Loop Passes
    let improved = true;
    let iterations = 0;
    const maxIterations = 5;
    const step = 10000;

    while (improved && iterations < maxIterations) {
        improved = false;
        for (let age = currentAge; age < maxOptimizeAge; age++) {
            const year = startYear + (age - currentAge);
            const currentVal = bestConversions[year] || 0;

            // Micro upside evaluation
            const testAddConversions = { ...bestConversions, [year]: currentVal + step };
            const addRes = runProjection({ ...params, conversions: testAddConversions });
            const addScore = addRes[addRes.length - 1].adjustedNetWorth;

            if (addScore > bestScore + 100) {
                bestScore = addScore;
                bestConversions = testAddConversions;
                improved = true;
                continue;
            }

            // Micro downside evaluation
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