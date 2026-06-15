import { runProjection } from './projectionRunner.js';
import { optimizeRothConversions } from './optimizer.js';
import { 
    updateNetWorthChart, 
    updateConversionsTaxChart, 
    updateCashFlowChart, 
    updateAccountBalancesChart, 
    updateTaxBreakdownChart \n} from './chartManager.js';

// Cache results for parallel scenario visualization switching
let cachedBaseline = [];
let cachedOptimized = [];
let activeTableView = 'baseline';

// Core UI Element selector shortcut helper
const getEl = id => document.getElementById(id);

// Active runtime map of optimized conversions
let activeConversions = {};

/**
 * Standard monetary formatting engine
 */
const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
    }).format(val);
};

/**
 * Syncs a slider element with a numeric input field seamlessly in both directions
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
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        slider.value = Math.max(min, Math.min(max, val));
        onChange();
    });
}

/**
 * Gathers input states from the sidebar panel and maps dynamic tracking age states
 */
function gatherInputParams() {
    const startYear = parseInt(getEl('start-year').value, 10) || 2027;
    const birthYear = parseInt(getEl('birth-year').value, 10) || 1961;

    return {
        startYear: startYear,
        birthYear: birthYear,
        currentAge: startYear - birthYear, 
        retirementAge: parseInt(getEl('retirement-age').value, 10) || 61,
        filingStatus: getEl('filing-status').value,
        state: getEl('state-residence').value,
        iraBalance: parseFloat(getEl('ira-balance').value) || 0,
        rothBalance: parseFloat(getEl('roth-balance').value) || 0,
        brokerageBalance: parseFloat(getEl('brokerage-balance').value) || 0,
        
        // CONSOLIDATED SINGLE SHIELD VALUE TRACKING
        taxFreeShield: parseFloat(getEl('tax-free-shield').value) || 0,

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
            parseFloat(getEl('magi-1yr').value) || 0
        ]
    };
}

/**
 * Recalculates baseline vs optimized paths and renders updated chart canvases/metrics
 */
function updateDashboard() {
    const params = gatherInputParams();
    
    // Evaluate parallel projection tracks
    const baselineYears = runProjection({ ...params, conversions: {} });
    const optimizedYears = runProjection({ ...params, conversions: activeConversions });

    if (baselineYears.length === 0 || optimizedYears.length === 0) return;

    const baseFinal = baselineYears[baselineYears.length - 1];
    const optFinal = optimizedYears[optimizedYears.length - 1];

    // Sync metrics text into the compact horizontal metrics summary strip
    getEl('metric-networth-baseline').innerText = formatCurrency(baseFinal.nominalNetWorth);
    getEl('metric-networth-optimized').innerText = formatCurrency(optFinal.nominalNetWorth);
    getEl('metric-adj-baseline').innerText = formatCurrency(baseFinal.adjustedNetWorth);
    getEl('metric-adj-optimized').innerText = formatCurrency(optFinal.adjustedNetWorth);

    const benefit = optFinal.adjustedNetWorth - baseFinal.adjustedNetWorth;
    getEl('metric-benefit').innerText = (benefit >= 0 ? '+' : '') + formatCurrency(benefit);

    // Refresh all active workspace tracking charts
    updateNetWorthChart('netWorthChart', baselineYears, optimizedYears);
    updateConversionsTaxChart('conversionsTaxChart', optimizedYears);
    updateCashFlowChart('cashFlowChart', optimizedYears, document.querySelector('input[name="cashflow-view"]:checked')?.value || 'net');
    updateAccountBalancesChart('accountBalancesChart', optimizedYears);
    updateTaxBreakdownChart('taxBreakdownChart', optimizedYears, document.querySelector('input[name="tax-view"]:checked')?.value || 'total');

    // Preserve output data array inside context cache
    cachedBaseline = baselineYears;
    cachedOptimized = optimizedYears;
    
    renderTable(activeTableView === 'optimized' ? cachedOptimized : cachedBaseline);
    generateAlerts(optimizedYears);
}

/**
 * Builds data rows dynamically inside the data ledger grid tab panel
 */
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
            <td class="col-adj">${formatCurrency(y.adjustedNetWorth)}</td>
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

/**
 * Assesses total structural impact of a plan strategy over time to build high level pills
 */
function generateAlerts(optimizedYears) {
    const alertsPanel = getEl('alerts-panel');
    const strategyGrid = getEl('strategy-metrics-grid');
    if (!alertsPanel || !strategyGrid) return;
    
    strategyGrid.innerHTML = '';
    const items = [];

    const totalLifetimeIrmaa = optimizedYears.reduce((sum, y) => sum + (y.taxes.irmaaCost || 0), 0);
    const irmaaYearsCount = optimizedYears.filter(y => y.taxes.irmaaCost > 0).length;

    if (totalLifetimeIrmaa > 0) {
        items.push({
            title: "Lifetime IRMAA Impact",
            body: `${formatCurrency(totalLifetimeIrmaa)} total over ${irmaaYearsCount} planning years.`
        });
    } else {
        items.push({
            title: "Lifetime IRMAA Impact",
            body: "$0 (No IRMAA Brackets Crossed)"
        });
    }

    const depletionYear = optimizedYears.find(y => y.balances.brokerage <= 100);
    if (depletionYear) {
        items.push({
            title: "Brokerage Account Liquidity",
            body: `Depleted at Age ${depletionYear.age} (${depletionYear.year}) to cover conversions/taxes.`
        });
    } else {
        items.push({
            title: "Brokerage Account Liquidity",
            body: "Maintained baseline cash flow solvency throughout."
        });
    }

    const activeConvYears = optimizedYears.filter(y => y.conversionAmount > 0);
    if (activeConvYears.length > 0) {
        items.push({
            title: "Active Conversion Window",
            body: `${activeConvYears.length} years (From ${activeConvYears[0].year} to ${activeConvYears[activeConvYears.length - 1].year})`
        });
    }

    if (items.length > 0) {
        alertsPanel.classList.remove('hidden');
        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'strategy-pill';
            div.innerHTML = `
                <span class="pill-title">${item.title}</span>
                <span class="pill-body">${item.body}</span>
            `;
            strategyGrid.appendChild(div);
        });
    } else {
        alertsPanel.classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const toggleSidebarBtn = getEl('toggle-sidebar-btn');
    const sidebarNode = document.querySelector('.sidebar');
    const appContainerNode = document.querySelector('.app-container');

    if (toggleSidebarBtn && sidebarNode && appContainerNode) {
        toggleSidebarBtn.addEventListener('click', () => {
            sidebarNode.classList.toggle('collapsed');
            appContainerNode.classList.toggle('sidebar-hidden');
            
            if (sidebarNode.classList.contains('collapsed')) {
                toggleSidebarBtn.innerText = 'Inputs ▸';
                toggleSidebarBtn.classList.add('collapsed-state');
            } else {
                toggleSidebarBtn.innerText = '◂ Hide Inputs';
                toggleSidebarBtn.classList.remove('collapsed-state');
            }
            setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 310);
        });
    }

    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetedContent = getEl(targetId);
            if (targetedContent) targetedContent.classList.add('active');

            window.dispatchEvent(new Event('resize'));
        });
    });

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
    setupDualInput('tax-free-shield-slider', 'tax-free-shield', updateDashboard);
    setupDualInput('annual-return-slider', 'annual-return', updateDashboard);
    setupDualInput('dividend-yield-slider', 'dividend-yield', updateDashboard);
    setupDualInput('inflation-rate-slider', 'inflation-rate', updateDashboard);
    setupDualInput('ira-discount-rate-slider', 'ira-discount-rate', updateDashboard);

    const standardInputs = [
        'birth-year', 'start-year', 'retirement-age', 'filing-status', 'state-residence',
        'social-security-profile', 'pension-profile', 'capgains-profile',
        'living-expenses-profile', 'magi-2yr', 'magi-1yr', 'tax-free-shield'
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