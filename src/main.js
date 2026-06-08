import { runProjection } from './projectionRunner.js';
import { optimizeRothConversions } from './optimizer.js';
import { updateNetWorthChart, updateTaxBracketsChart } from './chartManager.js';

// Cache both scenario results for tab switching
let cachedBaseline = [];
let cachedOptimized = [];
let activeTableView = 'baseline';

// Setup elements
const getEl = id => document.getElementById(id);

// Active schedule of optimized conversions
let activeConversions = {};

// Helper to format currency
const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
    }).format(val);
};

/**
 * Syncs a slider element with a numeric input field in both directions.
 */
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
        // Clamp input value to slider's bounds for visual sync
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        slider.value = Math.max(min, Math.min(max, val));
        onChange();
    });
}

/**
 * Gathers inputs from the UI and returns them in a single params object.
 */
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
        magiHistory: [
            parseFloat(getEl('magi-2yr').value) || 0,
            parseFloat(getEl('magi-1yr').value) || 0,
            parseFloat(getEl('magi-current').value) || 0
        ]
    };
}

/**
 * Runs the simulation and updates charts & metrics.
 */
function updateDashboard() {
    const params = gatherInputParams();

    // 1. Run baseline (No Conversions)
    const baselineYears = runProjection({ ...params, conversions: {} });
    
    // 2. Run optimized (Using the activeConversions schedule)
    const optimizedYears = runProjection({ ...params, conversions: activeConversions });

    // 3. Extract final scorecard results
    const baseFinal = baselineYears[baselineYears.length - 1];
    const optFinal = optimizedYears[optimizedYears.length - 1];

    // Update nominal metrics
    getEl('metric-networth-baseline').innerText = formatCurrency(baseFinal.nominalNetWorth);
    getEl('metric-networth-optimized').innerText = formatCurrency(optFinal.nominalNetWorth);

    // Update Adjusted After-Tax metrics
    getEl('metric-adj-baseline').innerText = formatCurrency(baseFinal.adjustedNetWorth);
    getEl('metric-adj-optimized').innerText = formatCurrency(optFinal.adjustedNetWorth);
    getEl('metric-adj-subtitle').innerText = `Target valuation using ${params.iraDiscountRate}% pre-tax discount`;

    // Update Benefit (Difference in Adjusted Net Worth)
    const benefit = optFinal.adjustedNetWorth - baseFinal.adjustedNetWorth;
    getEl('metric-benefit').innerText = (benefit >= 0 ? '+' : '') + formatCurrency(benefit);

    const diffCard = getEl('metric-benefit').closest('.metric-card');
    if (benefit < 0) {
        diffCard.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    } else {
        diffCard.style.borderColor = 'rgba(139, 92, 246, 0.2)';
    }

    // 4. Update Charts
    updateNetWorthChart('netWorthChart', baselineYears, optimizedYears);
    updateTaxBracketsChart('taxBracketsChart', optimizedYears, params.inflationRate, params.filingStatus);

    // 5. Cache results and render the active table view
    cachedBaseline = baselineYears;
    cachedOptimized = optimizedYears;
    renderTable(activeTableView === 'optimized' ? cachedOptimized : cachedBaseline, params.iraDiscountRate);

    // 6. Generate Alerts & Warnings (IRMAA & Brokerage depletion)
    generateAlerts(optimizedYears);
}

/**
 * Analyzes the optimized scenario results to trigger UI notices.
 */
function generateAlerts(optimizedYears) {
    const alertsPanel = getEl('alerts-panel');
    const alertsList = getEl('alerts-list');
    
    alertsList.innerHTML = '';
    const alerts = [];

    // Check for Brokerage depletion
    const depletionYear = optimizedYears.find(y => y.balances.brokerage <= 100);
    if (depletionYear) {
        alerts.push(`Brokerage account depleted at Age ${depletionYear.age} (${depletionYear.year}). Taxes will be funded from traditional IRA or Roth IRA.`);
    }

    // Check for IRMAA surcharges triggered by conversions
    const irmaaYears = optimizedYears.filter(y => y.taxes.irmaaCost > 0);
    if (irmaaYears.length > 0) {
        // Find peak surcharge year
        const peakYear = irmaaYears.reduce((prev, curr) => prev.taxes.irmaaCost > curr.taxes.irmaaCost ? prev : curr);
        alerts.push(`Medicare IRMAA surcharges triggered. Peak surcharge cost: ${formatCurrency(peakYear.taxes.irmaaCost)} at Age ${peakYear.age} (MAGI 2 years prior: ${formatCurrency(optimizedYears.find(y => y.year === peakYear.year - 2)?.taxes.agi || 0)}).`);
    }

    if (alerts.length > 0) {
        alertsPanel.classList.remove('hidden');
        alerts.forEach(alertText => {
            const li = document.createElement('li');
            li.innerText = alertText;
            alertsList.appendChild(li);
        });
    } else {
        alertsPanel.classList.add('hidden');
    }
}

/**
 * Populates the year-by-year detail table.
 * IRA discount rate is applied in the Adjusted Net Worth column.
 */
function renderTable(years, iraDiscountRate) {
    const tbody = getEl('detail-table-body');
    if (!tbody || !years || years.length === 0) return;

    // Update subtitle to reflect current discount rate
    const subtitle = getEl('table-discount-note');
    if (subtitle) {
        subtitle.textContent = `IRA (Pre-Tax) shows the gross pre-tax balance. Adjusted Net Worth = (IRA × (1 − ${iraDiscountRate}%)) + Roth + Brokerage, reflecting embedded income tax liability.`;
    }

    tbody.innerHTML = '';
    const fmtM = (v) => {
        if (v === 0) return '—';
        if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
        if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
        return `$${Math.round(v).toLocaleString()}`;
    };

    years.forEach(y => {
        const tr = document.createElement('tr');

        const adjNW = (y.balances.ira * (1 - iraDiscountRate / 100)) + y.balances.roth + y.balances.brokerage;

        const cells = [
            { val: y.year, cls: '' },
            { val: y.age, cls: '' },
            { val: fmtM(y.balances.ira), cls: '' },                            // IRA pre-tax
            { val: fmtM(y.balances.roth), cls: '' },
            { val: fmtM(y.balances.brokerage), cls: '' },
            { val: fmtM(y.nominalNetWorth), cls: '' },
            { val: fmtM(adjNW), cls: 'col-adj' },                              // Adj NW with IRA discount
            { val: y.conversionAmount > 0 ? fmtM(y.conversionAmount) : '—', cls: y.conversionAmount > 0 ? 'has-conversion' : '' },
            { val: y.rmd > 0 ? fmtM(y.rmd) : '—', cls: y.rmd > 0 ? 'has-rmd' : '' },
            { val: fmtM(y.taxes.totalTax), cls: '' },
            { val: fmtM(y.taxes.fedOrdinaryTax), cls: '' },
            { val: fmtM(y.taxes.stateTax), cls: '' },
            { val: y.taxes.irmaaCost > 0 ? fmtM(y.taxes.irmaaCost) : '—', cls: y.taxes.irmaaCost > 0 ? 'has-irmaa' : '' },
            { val: fmtM(y.taxes.agi), cls: '' }
        ];

        cells.forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell.val;
            if (cell.cls) td.classList.add(cell.cls);
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });
}

/**
 * Triggers the mathematical search optimizer to find the best conversion schedule.
 */
function runOptimization() {
    const optimizeBtn = getEl('optimize-button');
    optimizeBtn.innerText = 'Optimizing...';
    optimizeBtn.disabled = true;

    // Run in a setTimeout to allow the browser thread to render the button text
    setTimeout(() => {
        try {
            const params = gatherInputParams();
            const result = optimizeRothConversions(params);
            activeConversions = result.conversions;
            updateDashboard();
        } catch (err) {
            console.error('Optimization failed', err);
        } finally {
            optimizeBtn.innerText = 'Optimize Conversions';
            optimizeBtn.disabled = false;
        }
    }, 50);
}

// Initial initialization and event listener bindings
window.addEventListener('DOMContentLoaded', () => {
    // Wire up tab buttons
    getEl('tab-baseline').addEventListener('click', () => {
        activeTableView = 'baseline';
        getEl('tab-baseline').classList.add('active');
        getEl('tab-optimized').classList.remove('active');
        const params = gatherInputParams();
        renderTable(cachedBaseline, params.iraDiscountRate);
    });

    getEl('tab-optimized').addEventListener('click', () => {
        activeTableView = 'optimized';
        getEl('tab-optimized').classList.add('active');
        getEl('tab-baseline').classList.remove('active');
        const params = gatherInputParams();
        renderTable(cachedOptimized, params.iraDiscountRate);
    });
    // Bind slider & text inputs
    setupDualInput('ira-balance-slider', 'ira-balance', updateDashboard);
    setupDualInput('roth-balance-slider', 'roth-balance', updateDashboard);
    setupDualInput('brokerage-balance-slider', 'brokerage-balance', updateDashboard);
    setupDualInput('brokerage-basis-slider', 'brokerage-basis', updateDashboard);
    
    setupDualInput('annual-return-slider', 'annual-return', updateDashboard);
    setupDualInput('dividend-yield-slider', 'dividend-yield', updateDashboard);
    setupDualInput('inflation-rate-slider', 'inflation-rate', updateDashboard);
    setupDualInput('ira-discount-rate-slider', 'ira-discount-rate', updateDashboard);

    // Bind other non-slider inputs
    const standardInputs = [
        'birth-year', 'start-year', 'current-age', 'retirement-age', 
        'filing-status', 'state-residence', 'medicare-start',
        'social-security-profile', 'pension-profile', 'capgains-profile',
        'magi-2yr', 'magi-1yr', 'magi-current'
    ];

    standardInputs.forEach(id => {
        const el = getEl(id);
        if (el) el.addEventListener('input', updateDashboard);
    });

    // Optimize Button
    const optBtn = getEl('optimize-button');
    if (optBtn) optBtn.addEventListener('click', runOptimization);

    // Initial render
    updateDashboard();
});
