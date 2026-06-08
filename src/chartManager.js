import { BASE_DATA_2026, getInflatedValue } from './taxEngine.js';

/**
 * Roth Conversion Optimizer - Chart Manager
 * Handles Chart.js initialization, custom dark-mode rendering, gradients, and real-time updates.
 */

let netWorthChart = null;
let taxBracketsChart = null;

// Helper to format currency
const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
    }).format(val);
};

/**
 * Initializes/updates the Net Worth projection line chart.
 */
export function updateNetWorthChart(canvasId, baselineYears, optimizedYears) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    const labels = baselineYears.map(y => `Age ${y.age} (${y.year})`);
    const baselineData = baselineYears.map(y => y.nominalNetWorth);
    const optimizedData = optimizedYears.map(y => y.nominalNetWorth);

    // If chart exists, update data and redraw
    if (netWorthChart) {
        netWorthChart.data.labels = labels;
        netWorthChart.data.datasets[0].data = baselineData;
        netWorthChart.data.datasets[1].data = optimizedData;
        netWorthChart.update();
        return;
    }

    // Create custom neon gradients for the lines
    const gradBaseline = ctx.createLinearGradient(0, 0, 0, 400);
    gradBaseline.addColorStop(0, 'rgba(251, 146, 60, 0.2)');
    gradBaseline.addColorStop(1, 'rgba(251, 146, 60, 0.0)');

    const gradOptimized = ctx.createLinearGradient(0, 0, 0, 400);
    gradOptimized.addColorStop(0, 'rgba(59, 130, 246, 0.25)');
    gradOptimized.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    netWorthChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Without Conversion',
                    data: baselineData,
                    borderColor: 'rgba(251, 146, 60, 0.95)',
                    borderWidth: 3,
                    backgroundColor: gradBaseline,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: 'rgba(251, 146, 60, 1)'
                },
                {
                    label: 'With Optimized Conversion',
                    data: optimizedData,
                    borderColor: '#3b82f6',
                    borderWidth: 3,
                    backgroundColor: gradOptimized,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: '#06b6d4'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#13151c',
                    titleColor: '#ffffff',
                    bodyColor: '#f3f4f6',
                    borderColor: 'rgba(255, 255, 255, 0.08)',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: (context) => {
                            const val = context.raw;
                            const idx = context.dataIndex;
                            const yearObj = context.datasetIndex === 0 ? baselineYears[idx] : optimizedYears[idx];
                            const { ira, roth, brokerage } = yearObj.balances;
                            
                            return [
                                `${context.dataset.label}: ${formatCurrency(val)}`,
                                `  • IRA: ${formatCurrency(ira)}`,
                                `  • Roth: ${formatCurrency(roth)}`,
                                `  • Brokerage: ${formatCurrency(brokerage)}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: {
                        color: '#9ca3af',
                        font: { family: 'Inter', size: 10 },
                        callback: (value) => {
                            if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
                            if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}k`;
                            return `$${value}`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Initializes/updates the Tax Bracket & Conversion stacked bar chart.
 */
export function updateTaxBracketsChart(canvasId, optimizedYears, inflationRate, filingStatus) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    const labels = optimizedYears.map(y => `Age ${y.age}`);
    
    const ordinaryTaxable = optimizedYears.map(y => Math.max(0, y.taxes.ordinaryTaxable - y.conversionAmount));
    const conversions = optimizedYears.map(y => y.conversionAmount);

    // Calculate dynamic inflated bracket boundaries for each year
    const limit10 = [];
    const limit12 = [];
    const limit22 = [];
    const limit24 = [];

    optimizedYears.forEach(y => {
        const inflationYears = Math.max(0, y.year - 2026);
        const rate = inflationRate / 100;
        const fedBrackets = BASE_DATA_2026.federal[filingStatus] || BASE_DATA_2026.federal.single;

        limit10.push(getInflatedValue(fedBrackets[0].max, rate, inflationYears));
        limit12.push(getInflatedValue(fedBrackets[1].max, rate, inflationYears));
        limit22.push(getInflatedValue(fedBrackets[2].max, rate, inflationYears));
        limit24.push(getInflatedValue(fedBrackets[3].max, rate, inflationYears));
    });

    if (taxBracketsChart) {
        taxBracketsChart.data.labels = labels;
        taxBracketsChart.data.datasets[0].data = ordinaryTaxable;
        taxBracketsChart.data.datasets[1].data = conversions;
        taxBracketsChart.data.datasets[2].data = limit10;
        taxBracketsChart.data.datasets[3].data = limit12;
        taxBracketsChart.data.datasets[4].data = limit22;
        taxBracketsChart.data.datasets[5].data = limit24;
        taxBracketsChart.update();
        return;
    }

    taxBracketsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Base Taxable Income',
                    data: ordinaryTaxable,
                    backgroundColor: 'rgba(59, 130, 246, 0.35)',
                    borderColor: 'rgba(59, 130, 246, 0.6)',
                    borderWidth: 1,
                    stack: 'Stack 0',
                    order: 2
                },
                {
                    label: 'Roth Conversion Amount',
                    data: conversions,
                    backgroundColor: 'rgba(139, 92, 246, 0.85)',
                    borderColor: '#8b5cf6',
                    borderWidth: 1,
                    stack: 'Stack 0',
                    borderRadius: 4,
                    order: 2
                },
                // Bracket limits lines
                {
                    label: '10% Bracket Limit',
                    data: limit10,
                    type: 'line',
                    borderColor: '#22c55e',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    fill: false,
                    pointRadius: 0,
                    order: 1
                },
                {
                    label: '12% Bracket Limit',
                    data: limit12,
                    type: 'line',
                    borderColor: '#eab308',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    fill: false,
                    pointRadius: 0,
                    order: 1
                },
                {
                    label: '22% Bracket Limit',
                    data: limit22,
                    type: 'line',
                    borderColor: '#f97316',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    fill: false,
                    pointRadius: 0,
                    order: 1
                },
                {
                    label: '24% Bracket Limit',
                    data: limit24,
                    type: 'line',
                    borderColor: '#ef4444',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    fill: false,
                    pointRadius: 0,
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#13151c',
                    titleColor: '#ffffff',
                    bodyColor: '#f3f4f6',
                    borderColor: 'rgba(255, 255, 255, 0.08)',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: (context) => {
                            const val = context.raw;
                            if (context.dataset.type === 'line') {
                                return `${context.dataset.label}: ${formatCurrency(val)}`;
                            }
                            const idx = context.dataIndex;
                            const yearObj = optimizedYears[idx];
                            return `${context.dataset.label}: ${formatCurrency(val)} (AGI: ${formatCurrency(yearObj.taxes.agi)})`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: {
                        color: '#9ca3af',
                        font: { family: 'Inter', size: 10 },
                        callback: (value) => `$${(value / 1e3).toFixed(0)}k`
                    }
                }
            }
        }
    });
}
