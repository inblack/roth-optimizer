import { runProjection } from './projectionRunner.js';
import { optimizeRothConversions } from './optimizer.js';
import { 
    updateNetWorthChart, 
    updateConversionsTaxChart, 
    updateCashFlowChart, 
    updateAccountBalancesChart, 
    updateTaxBreakdownChart 
} from './chartManager.js';

let cachedBaseline = [];
let cachedOptimized = [];
let activeTableView = 'baseline';

const getEl = id => document.getElementById(id);
let activeConversions = {};

const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
    }).format(val);
};

function setupDualInput(sliderId, inputId, onChange) {
    const slider = getEl(sliderId);
    const input = getEl(inputId);
    if (!slider || !input) return;

    slider.addEventListener('input', (e) => {
        input.value = e.target.value;
        onChange();
    });
    input.addEventListener('input', (e) => {
        let val = parseFloat(e.target.value) || 0;
        slider.value = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), val));
        onChange();
    });
}

function gatherInputParams() {
    return {
        startYear: parseInt(getEl('start-year').value, 10) || 2027,
        birthYear: parseInt(getEl('birth-year').value, 10) || 1961,
        currentAge: parseInt(getEl('current-age').value, 10) || 66,
        retirementAge: parseInt(getEl('retirement-age').value, 10) || 61,
        filingStatus: getEl('filing-status').value,
        state: getEl('state-residence').value,
        iraBalance: parseFloat(getEl('ira-balance').value) || 0,
        rothBalance: parseFloat(getEl('roth-balance').value) || 0,
        brokerageBalance: parseFloat(getEl('brokerage-balance').value) || 0,
        brokerageBasis: parseFloat(getEl('brokerage-basis').value) || 0,
        annualReturn: parseFloat(getEl('annual-return').value) || 0,
        dividendYield: parseFloat(getEl('dividend-yield').value) || 0,
        inflationRate: parseFloat(getEl('inflation-rate').value) || 0,
        iraDiscountRate: parseFloat(getEl('ira-discount-rate').value) || 0,
        ssProfile: getEl('social-security-profile').value,
        pensionProfile: getEl('pension-profile').value,
        capGainsProfile: getEl('capgains-profile').value,
        livingExpensesProfile: getEl('living-expenses-profile').value,
        magiHistory: [
            parseFloat(getEl('magi-2yr').value) || 0,
            parseFloat(getEl('magi-1yr').value) || 0,
            parseFloat(getEl('magi-current').value) || 0
        ]
    };
}

function updateDashboard() {
    const params = gatherInputParams();
    const baselineYears = runProjection({ ...params, conversions: {} });
    const optimizedYears = runProjection({ ...params, conversions: activeConversions });

    const baseFinal = baselineYears[baselineYears.length - 1];
    const optFinal = optimizedYears[optimizedYears.length - 1];

    getEl('metric-networth-baseline').innerText = formatCurrency(baseFinal.nominalNetWorth);
    getEl('metric-networth-optimized').innerText = formatCurrency(optFinal.nominalNetWorth);
    getEl('metric-adj-baseline').innerText = formatCurrency(baseFinal.adjustedNetWorth);
    getEl('metric-adj-optimized').innerText = formatCurrency(optFinal.adjustedNetWorth);
    getEl('metric-adj-subtitle').innerText = `Target valuation using ${params.iraDiscountRate}% pre-tax discount`;

    const benefit = optFinal.adjustedNetWorth - baseFinal.adjustedNetWorth;
    getEl('metric-benefit').innerText = (benefit >= 0 ? '+' : '') + formatCurrency(benefit);

    updateNetWorthChart('netWorthChart', baselineYears, optimizedYears);
    updateConversionsTaxChart('conversionsTaxChart', optimizedYears);
    updateCashFlowChart('cashFlowChart', optimizedYears, document.querySelector('input[name="cashflow-view"]:checked')?.value || 'net');
    updateAccountBalancesChart('accountBalancesChart', optimizedYears);
    updateTaxBreakdownChart('taxBreakdownChart', optimizedYears, document.querySelector('input[name="tax-view"]:checked')?.value || 'total');

    cachedBaseline = baselineYears;
    cachedOptimized = optimizedYears;
    renderTable(activeTableView === 'optimized' ? cachedOptimized : cachedBaseline);
    generateAlerts(optimizedYears);
}

function renderTable(years) {
    const tbody = getEl('detail-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    years.forEach(y => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${y.year}</td>
            <td>${y.age}</td>
            <td>${formatCurrency(y.balances.ira)}</td>
            <td>${formatCurrency(y.balances.roth)}</td>
            <td>${formatCurrency(y.balances.brokerage)}</td>
            <td>${formatCurrency(y.nominalNetWorth)}</td>
            <td>${formatCurrency(y.adjustedNetWorth)}</td>
            <td>${formatCurrency(y.conversionAmount)}</td>
            <td>${formatCurrency(y.rmd)}</td>
            <td>${formatCurrency(y.taxes.totalTax)}</td>
            <td>${formatCurrency(y.taxes.fedTax)}</td>
            <td>${formatCurrency(y.taxes.stateTax)}</td>
            <td>${formatCurrency(y.taxes.irmaaCost)}</td>
            <td>${formatCurrency(y.livingExpenses)}</td>
            <td>${formatCurrency(y.surplus)}</td>
            <td>${formatCurrency(y.taxes.agi)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function generateAlerts(optimizedYears) {
    const alertsPanel = getEl('alerts-panel');
    const alertsList = getEl('alerts-list');
    if (!alertsPanel || !alertsList) return;
    
    alertsList.innerHTML = '';
    const alerts = [];

    const depletionYear = optimizedYears.find(y => y.balances.brokerage <= 100);
    if (depletionYear) {
        alerts.push(`Brokerage account depleted at Age ${depletionYear.age} (${depletionYear.year}).`);
    }

    const irmaaYears = optimizedYears.filter(y => y.taxes.irmaaCost > 0);
    if (irmaaYears.length > 0) {
        const peakYear = irmaaYears.reduce((prev, curr) => prev.taxes.irmaaCost > curr.taxes.irmaaCost ? prev : curr);
        alerts.push(`Medicare IRMAA surcharges triggered. Peak cost: ${formatCurrency(peakYear.taxes.irmaaCost)} at Age ${peakYear.age}.`);
    }

    if (alerts.length > 0) {
        alertsPanel.classList.remove('hidden');
        alerts.forEach(t => {
            const li = document.createElement('li');
            li.innerText = t;
            alertsList.appendChild(li);
        });
    } else {
        alertsPanel.classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Sync buttons
    getEl('btn-view-baseline').addEventListener('click', () => {
        activeTableView = 'baseline';
        getEl('btn-view-baseline').classList.add('active');
        getEl('btn-view-optimized').classList.remove('active');
        renderTable(cachedBaseline);
    });

    getEl('btn-view-optimized').addEventListener('click', () => {
        activeTableView = 'optimized';
        getEl('btn-view-optimized').classList.add('active');
        getEl('btn-view-baseline').classList.remove('active');
        renderTable(cachedOptimized);
    });

    document.querySelectorAll('input[name="cashflow-view"]').forEach(el => {
        el.addEventListener('change', () => updateCashFlowChart('cashFlowChart', cachedOptimized, el.value));
    });

    document.querySelectorAll('input[name="tax-view"]').forEach(el => {
        el.addEventListener('change', () => updateTaxBreakdownChart('taxBreakdownChart', cachedOptimized, el.value));
    });

    setupDualInput('ira-balance-slider', 'ira-balance', updateDashboard);
    setupDualInput('roth-balance-slider', 'roth-balance', updateDashboard);
    setupDualInput('brokerage-balance-slider', 'brokerage-balance', updateDashboard);
    setupDualInput('brokerage-basis-slider', 'brokerage-basis', updateDashboard);
    setupDualInput('annual-return-slider', 'annual-return', updateDashboard);
    setupDualInput('dividend-yield-slider', 'dividend-yield', updateDashboard);
    setupDualInput('inflation-rate-slider', 'inflation-rate', updateDashboard);
    setupDualInput('ira-discount-rate-slider', 'ira-discount-rate', updateDashboard);

    const standardInputs = [
        'birth-year', 'start-year', 'current-age', 'retirement-age', 
        'filing-status', 'state-residence', 'medicare-start',
        'social-security-profile', 'pension-profile', 'capgains-profile',
        'living-expenses-profile', 'magi-2yr', 'magi-1yr', 'magi-current'
    ];
    standardInputs.forEach(id => {
        const el = getEl(id);
        if (el) el.addEventListener('input', updateDashboard);
    });

    getEl('optimize-btn').addEventListener('click', () => {
        const params = gatherInputParams();
        const res = optimizeRothConversions(params);
        activeConversions = res.conversions;
        updateDashboard();
    });

    updateDashboard();
});