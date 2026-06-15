import { BASE_DATA_2026, getInflatedValue } from './taxEngine.js';
import { parseProfile } from './projectionRunner.js';

let netWorthChart = null;
let conversionsTaxChart = null;
let cashFlowChart = null;
let accountBalancesChart = null;
let taxBreakdownChart = null;

const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
    }).format(val);
};

const commonScales = {
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
                if (value <= -1e6) return `-$${(Math.abs(value) / 1e6).toFixed(1)}M`;
                if (value <= -1e3) return `-$${(Math.abs(value) / 1e3).toFixed(0)}k`;
                return `$${value}`;
            }
        }
    }
};

export function updateNetWorthChart(canvasId, baselineYears, optimizedYears) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (netWorthChart) {
        netWorthChart.destroy();
    }

    const labels = baselineYears.map(y => `Age ${y.age} (${y.year})`);
    const baselineData = baselineYears.map(y => y.nominalNetWorth);
    const optimizedData = optimizedYears.map(y => y.nominalNetWorth);

    const gradBaseline = ctx.createLinearGradient(0, 0, 0, 400);
    gradBaseline.addColorStop(0, 'rgba(251, 146, 60, 0.15)');
    gradBaseline.addColorStop(1, 'rgba(251, 146, 60, 0.0)');

    const gradOptimized = ctx.createLinearGradient(0, 0, 0, 400);
    gradOptimized.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
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
                    pointRadius: 0
                },
                {
                    label: 'With Optimized Conversion',
                    data: optimizedData,
                    borderColor: '#3b82f6',
                    borderWidth: 3,
                    backgroundColor: gradOptimized,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0
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
                                `  • IRA (Pre-Tax): ${formatCurrency(ira)}`,
                                `  • Roth IRA: ${formatCurrency(roth)}`,
                                `  • Brokerage: ${formatCurrency(brokerage)}`
                            ];
                        }
                    }
                }
            },
            scales: commonScales
        }
    });
}

export function updateConversionsTaxChart(canvasId, optimizedYears) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (conversionsTaxChart) {
        conversionsTaxChart.destroy();
    }

    const labels = optimizedYears.map(y => `Age ${y.age}`);
    const conversions = optimizedYears.map(y => y.conversionAmount);
    const taxes = optimizedYears.map(y => y.taxes.totalTax);

    conversionsTaxChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Roth Conversion',
                    data: conversions,
                    backgroundColor: 'rgba(139, 92, 246, 0.85)',
                    borderColor: '#8b5cf6',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: 'Total Tax Paid',
                    data: taxes,
                    backgroundColor: 'rgba(239, 68, 68, 0.75)',
                    borderColor: '#ef4444',
                    borderWidth: 1,
                    borderRadius: 4
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
                    borderColor: 'rgba(255, 255, 255, 0.08)',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${formatCurrency(context.raw)}`
                    }
                }
            },
            scales: commonScales
        }
    });
}

export function updateCashFlowChart(canvasId, optimizedYears, viewType) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (cashFlowChart) {
        cashFlowChart.destroy();
    }

    const labels = optimizedYears.map(y => `Age ${y.age} (${y.year})`);
    let datasets = [];
    let chartType = 'bar';

    if (viewType === 'net') {
        chartType = 'line';
        const netFlowData = optimizedYears.map(y => y.cashInflows - (y.livingExpenses + y.taxes.totalTax));
        datasets = [
            {
                label: 'Net Cash Flow',
                data: netFlowData,
                borderColor: '#06b6d4',
                backgroundColor: 'rgba(6, 182, 212, 0.15)',
                borderWidth: 3,
                fill: true,
                tension: 0.3
            }
        ];
    } else if (viewType === 'inflow') {
        datasets = [
            { label: 'Pension', data: optimizedYears.map(y => y.pension), backgroundColor: '#22c55e' },
            { label: 'Social Security', data: optimizedYears.map(y => y.socialSecurity), backgroundColor: '#3b82f6' },
            { label: 'Dividends & Capital Gains', data: optimizedYears.map(y => y.dividends), backgroundColor: '#06b6d4' },
            { label: 'RMDs', data: optimizedYears.map(y => y.rmd), backgroundColor: '#f97316' }
        ];
    } else if (viewType === 'outflow') {
        datasets = [
            { label: 'Living Expenses', data: optimizedYears.map(y => y.livingExpenses), backgroundColor: '#f43f5e' },
            { label: 'Total Taxes Paid', data: optimizedYears.map(y => y.taxes.totalTax), backgroundColor: '#ef4444' }
        ];
    }

    cashFlowChart = new Chart(ctx, {
        type: chartType,
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, labels: { color: '#9ca3af' } },
                tooltip: { backgroundColor: '#13151c', padding: 12 }
            },
            scales: commonScales
        }
    });
}

export function updateAccountBalancesChart(canvasId, optimizedYears) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (accountBalancesChart) {
        accountBalancesChart.destroy();
    }

    const labels = optimizedYears.map(y => `Age ${y.age}`);

    accountBalancesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Traditional IRA', data: optimizedYears.map(y => y.balances.ira), backgroundColor: '#f97316' },
                { label: 'Roth IRA', data: optimizedYears.map(y => y.balances.roth), backgroundColor: '#a855f7' },
                { label: 'Brokerage', data: optimizedYears.map(y => y.balances.brokerage), backgroundColor: '#3b82f6' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, labels: { color: '#9ca3af' } },
                tooltip: { backgroundColor: '#13151c', padding: 12 }
            },
            scales: {
                x: { stacked: true, grid: { display: false }, ticks: { color: '#9ca3af' } },
                y: { stacked: true, grid: { color: 'rgba(255, 255, 255, 0.03)' }, ticks: { color: '#9ca3af' } }
            }
        }
    });
}

export function updateTaxBreakdownChart(canvasId, optimizedYears, viewType) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (taxBreakdownChart) {
        taxBreakdownChart.destroy();
    }

    const labels = optimizedYears.map(y => `Age ${y.age}`);
    let datasets = [];

    if (viewType === 'total') {
        datasets = [
            { label: 'Federal Income Tax', data: optimizedYears.map(y => y.taxes.fedTax), backgroundColor: '#3b82f6' },
            { label: 'State Tax', data: optimizedYears.map(y => y.taxes.stateTax), backgroundColor: '#a855f7' },
            { label: 'Medicare IRMAA Cost', data: optimizedYears.map(y => y.taxes.irmaaCost), backgroundColor: '#ef4444' }
        ];
    } else if (viewType === 'ss') {
        datasets = [
            { label: 'Taxable SS Benefits', data: optimizedYears.map(y => y.taxes.taxableSS), backgroundColor: '#22c55e' }
        ];
    } else if (viewType === 'medicare') {
        datasets = [
            { label: 'Medicare / IRMAA Surcharge', data: optimizedYears.map(y => y.taxes.irmaaCost), backgroundColor: '#ef4444' }
        ];
    }

    taxBreakdownChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, labels: { color: '#9ca3af' } },
                tooltip: { backgroundColor: '#13151c', padding: 12 }
            },
            scales: {
                x: { stacked: true, grid: { display: false }, ticks: { color: '#9ca3af' } },
                y: { stacked: true, grid: { color: 'rgba(255, 255, 255, 0.03)' }, ticks: { color: '#9ca3af' } }
            }
        }
    });
}