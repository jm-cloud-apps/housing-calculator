import { DEFAULTS, RANGES, PRIMARY_FIELDS, ADVANCED_FIELDS, GDS_MAX_RATIO } from "./constants.js";
import { bindSliderField } from "./sliderfield.js";
import { runSimulation } from "./simulate.js";
import { drawComparisonChart } from "./chart.js";
import { formatMoney, formatPercent } from "./finance.js";

const fields = {}; // key -> { get, set }
let taxMode = DEFAULTS.taxMode;

export function initUI() {
  const primaryContainer = document.getElementById("primary-fields");
  const advancedContainer = document.getElementById("advanced-fields");

  for (const meta of PRIMARY_FIELDS) renderAndBind(primaryContainer, meta);
  for (const meta of ADVANCED_FIELDS) renderAndBind(advancedContainer, meta);

  document.getElementById("tax-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    taxMode = btn.dataset.taxMode;
    document.querySelectorAll("#tax-toggle .seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
    updateMarginalTaxVisibility();
    recompute();
  });

  updateMarginalTaxVisibility();
  recompute();
}

function renderAndBind(container, meta) {
  const { key, label, prefix, suffix, showPercentOf } = meta;
  const range = RANGES[key];
  const def = DEFAULTS[key];

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
  return values;
}

function recompute() {
  const inputs = gatherInputs();
  const result = runSimulation(inputs);

  updateDownPaymentSub(inputs);
  renderHeadline(result, inputs.horizonYears);
  drawComparisonChart(document.getElementById("net-worth-chart"), {
    years: result.years,
    ownerSeries: result.ownerNetWorth,
    renterSeries: result.renterNetWorth,
  });
  renderCmhcCard(result);
  renderPttCard(result);
  renderMonthlyCard(result);
  renderGdsCard(result);
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

function renderPttCard(result) {
  const body = document.querySelector("#card-ptt .breakdown-body");
  body.innerHTML = `
    <div class="row"><span>BC PTT</span><span>${formatMoney(result.ptt)}</span></div>
    <div class="row"><span>Total closing costs</span><span>${formatMoney(result.closingCosts)}</span></div>
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
