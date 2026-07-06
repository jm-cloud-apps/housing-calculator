import {
  DEFAULTS,
  RANGES,
  PRIMARY_FIELDS,
  ADVANCED_FIELDS,
  MISC_FIELDS,
  MISC_DEFAULTS,
  MISC_RANGES,
  GDS_MAX_RATIO,
} from "./constants.js";
import { bindSliderField } from "./sliderfield.js";
import { runSimulation } from "./simulate.js";
import { drawComparisonChart } from "./chart.js";
import { formatMoney, formatPercent } from "./finance.js";

const fields = {}; // key -> { get, set }
let taxMode = DEFAULTS.taxMode;
let isFirstTimeBuyer = DEFAULTS.isFirstTimeBuyer;
let lastResult = null;

export function initUI() {
  const primaryContainer = document.getElementById("primary-fields");
  const advancedContainer = document.getElementById("advanced-fields");
  const miscContainer = document.getElementById("misc-fields");

  for (const meta of PRIMARY_FIELDS) renderAndBind(primaryContainer, meta);
  for (const meta of ADVANCED_FIELDS) renderAndBind(advancedContainer, meta);
  for (const meta of MISC_FIELDS) renderAndBind(miscContainer, meta, MISC_DEFAULTS, MISC_RANGES);

  document.getElementById("tax-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    taxMode = btn.dataset.taxMode;
    document.querySelectorAll("#tax-toggle .seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
    updateMarginalTaxVisibility();
    recompute();
  });

  document.getElementById("firstTimeBuyer").addEventListener("change", (e) => {
    isFirstTimeBuyer = e.target.checked;
    recompute();
  });

  document.getElementById("chart-scrubber").addEventListener("input", renderChartDisplay);

  updateMarginalTaxVisibility();
  recompute();
}

function renderAndBind(container, meta, defaultsSource = DEFAULTS, rangesSource = RANGES) {
  const { key, label, prefix, suffix, showPercentOf } = meta;
  const range = rangesSource[key];
  const def = defaultsSource[key];

  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.dataset.field = key;
  wrap.innerHTML = `
    <div class="field-label-row">
      <label for="${key}-slider">${label}</label>
      <span class="field-sub" id="${key}-sub"></span>
    </div>
    <div class="field-controls">
      <input type="range" id="${key}-slider" min="${range.min}" max="${range.max}" step="${range.step}" value="${def}" />
      <div class="number-wrap">
        ${prefix ? `<span class="unit">${prefix}</span>` : ""}
        <input type="number" id="${key}-value" inputmode="decimal" step="${range.step}" value="${def}" />
        ${suffix ? `<span class="unit">${suffix}</span>` : ""}
      </div>
    </div>
  `;
  container.appendChild(wrap);

  fields[key] = bindSliderField(key, {
    ...range,
    value: def,
    onChange: () => recompute(),
  });

  if (showPercentOf) fields[key]._showPercentOf = showPercentOf;
}

function updateMarginalTaxVisibility() {
  const el = document.querySelector('[data-field="marginalTaxRate"]');
  if (el) el.style.display = taxMode === "taxable" ? "" : "none";
}

function gatherInputs() {
  // Down payment can't sensibly exceed home price — clamp here rather than fighting
  // the slider's own static range, since the sane max depends on the *other* field.
  const homePrice = fields.homePrice.get();
  if (fields.downPayment.get() > homePrice) fields.downPayment.set(homePrice);

  const values = {};
  for (const key of Object.keys(fields)) values[key] = fields[key].get();
  values.taxMode = taxMode;
  values.isFirstTimeBuyer = isFirstTimeBuyer;
  return values;
}

function recompute() {
  const inputs = gatherInputs();
  const result = runSimulation(inputs);
  lastResult = result;

  const scrubber = document.getElementById("chart-scrubber");
  const maxYear = result.years.length - 1;
  scrubber.max = maxYear;
  if (Number(scrubber.value) > maxYear) scrubber.value = maxYear;

  updateDownPaymentSub(inputs);
  renderHeadline(result, inputs.horizonYears);
  renderChartDisplay();
  renderCmhcCard(result);
  renderCashCard(result);
  renderMonthlyCard(result);
  renderGdsCard(result);
  renderMiscTotal();
}

function renderChartDisplay() {
  if (!lastResult) return;
  const scrubber = document.getElementById("chart-scrubber");
  const markerYear = Number(scrubber.value);

  drawComparisonChart(document.getElementById("net-worth-chart"), {
    years: lastResult.years,
    ownerSeries: lastResult.ownerNetWorth,
    renterSeries: lastResult.renterNetWorth,
    breakeven: lastResult.breakeven,
    markerYear,
  });

  const owner = lastResult.ownerNetWorth[markerYear];
  const renter = lastResult.renterNetWorth[markerYear];
  const ahead = owner >= renter ? "Buy" : "Rent + Invest";
  document.getElementById("chart-readout").innerHTML =
    `Year ${markerYear}: Buy ${formatMoney(owner, { compact: true })} · ` +
    `Rent + Invest ${formatMoney(renter, { compact: true })} — <strong>${ahead}</strong> ahead by ` +
    `${formatMoney(Math.abs(owner - renter), { compact: true })}`;

  const beEl = document.getElementById("breakeven-note");
  if (lastResult.breakeven) {
    beEl.textContent = `Break-even ≈ year ${lastResult.breakeven.year.toFixed(1)} (both worth about ${formatMoney(lastResult.breakeven.value, { compact: true })}).`;
  } else {
    beEl.textContent = `${lastResult.winner === "buy" ? "Buying" : "Renting + investing"} stays ahead for the entire horizon shown.`;
  }
}

function updateDownPaymentSub(inputs) {
  const el = document.getElementById("downPayment-sub");
  if (!el) return;
  const pct = inputs.homePrice > 0 ? (inputs.downPayment / inputs.homePrice) * 100 : 0;
  el.textContent = `${pct.toFixed(1)}% down`;
}

function renderHeadline(result, horizonYears) {
  const el = document.getElementById("headline");
  const sub = document.getElementById("headline-sub");
  const label = result.winner === "rent" ? "Renting + Investing wins" : "Buying wins";
  el.textContent = `${label} by ${formatMoney(result.diff, { compact: true })} after ${horizonYears} yr${horizonYears === 1 ? "" : "s"}`;
  el.className = result.winner === "rent" ? "winner-rent" : "winner-buy";
  sub.textContent = `Buy net worth: ${formatMoney(result.finalOwner, { compact: true })} · Rent + Invest net worth: ${formatMoney(result.finalRenter, { compact: true })}`;
}

function renderCmhcCard(result) {
  const body = document.querySelector("#card-cmhc .breakdown-body");
  const { cmhc } = result;
  let html = "";
  if (cmhc.status === "conventional") {
    html += `<div class="row"><span>Status</span><span class="badge badge-good">Conventional</span></div>`;
    html += `<div class="row"><span>LTV</span><span>${formatPercent(cmhc.ltv * 100)}</span></div>`;
    html += `<div class="row"><span>Premium</span><span>$0</span></div>`;
  } else if (cmhc.status === "insured") {
    html += `<div class="row"><span>Status</span><span class="badge badge-warn">Insured</span></div>`;
    html += `<div class="row"><span>LTV</span><span>${formatPercent(cmhc.ltv * 100)}</span></div>`;
    html += `<div class="row"><span>Premium rate</span><span>${formatPercent(cmhc.premiumRate * 100, 2)}</span></div>`;
    html += `<div class="row"><span>Premium</span><span>${formatMoney(cmhc.premium)}</span></div>`;
    if (cmhc.belowMinimum) html += `<p class="note">Down payment is below the minimum insurable threshold (5% on the first $500k + 10% above).</p>`;
  } else {
    html += `<div class="row"><span>Status</span><span class="badge badge-bad">Ineligible</span></div>`;
    html += `<p class="note">${cmhc.reason}</p>`;
  }
  if (result.amortizationCaveat) html += `<p class="note">30-year insured amortization is only available to first-time buyers or new-build purchases.</p>`;
  body.innerHTML = html;
}

function renderCashCard(result) {
  const body = document.querySelector("#card-cash .breakdown-body");
  let pttRow;
  if (result.pttExemption > 0) {
    pttRow = `
      <div class="row"><span>BC PTT</span><span><s>${formatMoney(result.rawPtt)}</s> ${formatMoney(result.ptt)}</span></div>
      <p class="note">First-time buyer exemption saves ${formatMoney(result.pttExemption)}.</p>
    `;
  } else {
    pttRow = `<div class="row"><span>BC PTT</span><span>${formatMoney(result.ptt)}</span></div>`;
  }
  body.innerHTML = `
    <div class="row"><span>Down payment</span><span>${formatMoney(result.downPayment)}</span></div>
    ${pttRow}
    <div class="row"><span>Legal + inspection</span><span>${formatMoney(result.legalInspectionCost)}</span></div>
    <div class="row"><strong>Total cash needed</strong><strong>${formatMoney(result.cashNeededToClose)}</strong></div>
  `;
}

function renderMonthlyCard(result) {
  const body = document.querySelector("#card-monthly .breakdown-body");
  const b = result.monthlyBreakdown;
  body.innerHTML = `
    <div class="row"><span>P&amp;I</span><span>${formatMoney(b.pi)}</span></div>
    <div class="row"><span>Property tax</span><span>${formatMoney(b.tax)}</span></div>
    <div class="row"><span>Heating</span><span>${formatMoney(b.heat)}</span></div>
    <div class="row"><span>Insurance</span><span>${formatMoney(b.insurance)}</span></div>
    <div class="row"><span>Maintenance</span><span>${formatMoney(b.maintenance)}</span></div>
    <div class="row"><span>Condo/strata</span><span>${formatMoney(b.condo)}</span></div>
    <div class="row"><strong>Total</strong><strong>${formatMoney(b.total)}</strong></div>
  `;
}

function renderGdsCard(result) {
  const body = document.querySelector("#card-gds .breakdown-body");
  if (result.gds == null) {
    body.innerHTML = `<p class="note">Enter a gross household income above to check affordability.</p>`;
    return;
  }
  const pct = result.gds * 100;
  let badgeClass = "badge-good";
  if (result.gds > GDS_MAX_RATIO + 0.03) badgeClass = "badge-bad";
  else if (result.gds > GDS_MAX_RATIO) badgeClass = "badge-warn";
  body.innerHTML = `
    <div class="row"><span>GDS ratio</span><span class="badge ${badgeClass}">${formatPercent(pct)}</span></div>
    <div class="row"><span>Max allowed</span><span>${formatPercent(GDS_MAX_RATIO * 100, 0)}</span></div>
  `;
}

function renderMiscTotal() {
  const total = MISC_FIELDS.reduce((sum, { key }) => sum + fields[key].get(), 0);
  document.getElementById("misc-total").innerHTML =
    `<div class="row"><strong>Total other expenses</strong><strong>${formatMoney(total)}/mo</strong></div>`;
}
