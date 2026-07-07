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
import { drawComparisonChart, PADDING as CHART_PADDING } from "./chart.js";
import { formatMoney, formatPercent, PAYMENT_FREQUENCIES } from "./finance.js";

const fields = {}; // key -> { get, set }
let taxMode = DEFAULTS.taxMode;
let isFirstTimeBuyer = DEFAULTS.isFirstTimeBuyer;
let paymentFrequency = DEFAULTS.paymentFrequency;
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

  const freqSelect = document.getElementById("payment-frequency");
  freqSelect.innerHTML = Object.entries(PAYMENT_FREQUENCIES)
    .map(([key, f]) => `<option value="${key}">${f.label}</option>`)
    .join("");
  freqSelect.value = paymentFrequency;
  freqSelect.addEventListener("change", (e) => {
    paymentFrequency = e.target.value;
    recompute();
  });

  document.getElementById("chart-scrubber").addEventListener("input", renderChartDisplay);
  document.getElementById("sensitivity-select").addEventListener("change", (e) => applyPreset(e.target.value));

  document.getElementById("result-bar").addEventListener("click", () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("results").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  });
  bindChartScrub();

  const firstTimeBuyerInput = document.getElementById("firstTimeBuyer");
  firstTimeBuyerInput.checked = DEFAULTS.isFirstTimeBuyer;
  isFirstTimeBuyer = firstTimeBuyerInput.checked;

  updateMarginalTaxVisibility();
  recompute();
}

function renderAndBind(container, meta, defaultsSource = DEFAULTS, rangesSource = RANGES) {
  const { key, label, prefix, suffix, showPercentOf, hint } = meta;
  const range = rangesSource[key];
  const def = defaultsSource[key];
  // iOS's decimal keypad has no minus key, so fields that allow negatives fall back to the
  // full keyboard (which does); the +/- steppers also let you cross zero without typing.
  const inputMode = range.min < 0 ? "text" : "decimal";

  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.dataset.field = key;
  wrap.innerHTML = `
    <div class="field-label-row">
      <label for="${key}-slider">${label}</label>
      <div class="value-group">
        <button type="button" class="stepper" id="${key}-dec" aria-label="Decrease ${label}">−</button>
        <div class="number-wrap">
          ${prefix ? `<span class="unit">${prefix}</span>` : ""}
          <input type="text" id="${key}-value" inputmode="${inputMode}" autocomplete="off" step="${range.step}" value="${def}" />
          ${suffix ? `<span class="unit">${suffix}</span>` : ""}
        </div>
        <button type="button" class="stepper" id="${key}-inc" aria-label="Increase ${label}">+</button>
      </div>
    </div>
    <span class="field-sub" id="${key}-sub"></span>
    ${hint ? `<p class="field-hint">${hint}</p>` : ""}
    <div class="field-controls">
      <input type="range" id="${key}-slider" min="${range.min}" max="${range.max}" step="${range.step}" value="${def}" />
    </div>
  `;
  container.appendChild(wrap);

  const formatAria = (v) => {
    const num = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 2 }).format(v);
    return `${prefix ?? ""}${num}${suffix ?? ""}`.trim();
  };

  fields[key] = bindSliderField(key, {
    ...range,
    value: def,
    onChange: () => recompute(),
    formatAria,
  });

  // Nudge by one step, snapped to the step grid so 0.1-type steps don't accumulate float drift.
  const stepBy = (dir) => {
    const cur = fields[key].get();
    fields[key].set(Math.round((cur + dir * range.step) / range.step) * range.step);
  };
  document.getElementById(`${key}-dec`).addEventListener("click", () => stepBy(-1));
  document.getElementById(`${key}-inc`).addEventListener("click", () => stepBy(1));

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
  values.paymentFrequency = paymentFrequency;
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
  renderFrequencyDetail(result);
  renderResultBar(result, inputs.horizonYears);
  renderHeadline(result, inputs.horizonYears);
  renderChartDisplay();
  renderCmhcCard(result);
  renderCashCard(result);
  renderMonthlyCard(result);
  renderGdsCard(result);
  renderMiscTotal(result);
  renderYearlyCashFlow(result);
  renderAmortizationSchedule(result);
}

function renderResultBar(result, horizonYears) {
  const bar = document.getElementById("result-bar");
  const isBuy = result.winner === "buy";
  bar.className = `result-bar ${isBuy ? "buy" : "rent"}`;
  bar.querySelector(".result-bar-text").innerHTML =
    `${isBuy ? "🏠" : "📈"} <strong>${isBuy ? "Buy" : "Rent + Invest"}</strong> ahead by ` +
    `<strong>${formatMoney(result.diff, { compact: true })}</strong> · ${horizonYears} yr${horizonYears === 1 ? "" : "s"}`;
}

// Touch/drag anywhere on the chart to move the year marker (iOS Stocks-style), keeping the
// range slider below in sync as an accessible fallback.
function bindChartScrub() {
  const canvas = document.getElementById("net-worth-chart");
  const scrubber = document.getElementById("chart-scrubber");
  let scrubbing = false;

  const yearFromEvent = (e) => {
    const rect = canvas.getBoundingClientRect();
    const plotW = rect.width - CHART_PADDING.left - CHART_PADDING.right;
    const frac = plotW > 0 ? (e.clientX - rect.left - CHART_PADDING.left) / plotW : 0;
    const maxYear = lastResult ? lastResult.years.length - 1 : Number(scrubber.max);
    return Math.max(0, Math.min(maxYear, Math.round(frac * maxYear)));
  };
  const scrubTo = (e) => {
    scrubber.value = yearFromEvent(e);
    renderChartDisplay();
  };

  canvas.addEventListener("pointerdown", (e) => {
    scrubbing = true;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* non-capturable pointer — fine */ }
    scrubTo(e);
  });
  canvas.addEventListener("pointermove", (e) => { if (scrubbing) scrubTo(e); });
  const end = () => { scrubbing = false; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
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
  const isBuyAhead = owner >= renter;
  const winnerLabel = isBuyAhead ? "Buy" : "Rent + Invest";
  const gap = Math.abs(owner - renter);
  const flow = lastResult.renterMonthlyFlow;
  document.getElementById("chart-readout").innerHTML = `
    <div class="chart-readout-card ${isBuyAhead ? "buy-ahead" : "rent-ahead"}">
      <div class="chart-readout-main">
        <span class="chart-readout-year">Year ${markerYear}</span>
        <span class="chart-readout-value">Buy ${formatMoney(owner, { compact: true })}</span>
        <span class="chart-readout-value">Rent + Invest ${formatMoney(renter, { compact: true })}</span>
      </div>
      <div class="chart-readout-result">
        <strong>${winnerLabel}</strong> is ahead by <strong>${formatMoney(gap, { compact: true })}</strong>
      </div>
      <div class="chart-readout-sub">Year 1 renter flow: rent ${formatMoney(flow.monthlyRent)}/mo + invest ${formatMoney(flow.monthlyInvestmentContribution)}/mo</div>
    </div>
  `;

  const beEl = document.getElementById("breakeven-note");
  if (lastResult.breakeven) {
    beEl.textContent = `Break-even ≈ year ${lastResult.breakeven.year.toFixed(1)} (both worth about ${formatMoney(lastResult.breakeven.value, { compact: true })}).`;
  } else {
    beEl.textContent = `${lastResult.winner === "buy" ? "Buying" : "Renting + investing"} stays ahead for the entire horizon shown.`;
  }
}

function applyPreset(presetName) {
  const presets = {
    base: {
      homePrice: DEFAULTS.homePrice,
      downPayment: DEFAULTS.downPayment,
      mortgageRate: DEFAULTS.mortgageRate,
      homeAppreciation: DEFAULTS.homeAppreciation,
      rentGrowth: DEFAULTS.rentGrowth,
      monthlyRent: DEFAULTS.monthlyRent,
    },
    "higher-rate": {
      homePrice: DEFAULTS.homePrice,
      downPayment: DEFAULTS.downPayment,
      mortgageRate: 6.5,
      homeAppreciation: DEFAULTS.homeAppreciation,
      rentGrowth: DEFAULTS.rentGrowth,
      monthlyRent: DEFAULTS.monthlyRent,
    },
    "lower-appreciation": {
      homePrice: DEFAULTS.homePrice,
      downPayment: DEFAULTS.downPayment,
      mortgageRate: DEFAULTS.mortgageRate,
      homeAppreciation: 0.5,
      rentGrowth: DEFAULTS.rentGrowth,
      monthlyRent: DEFAULTS.monthlyRent,
    },
    "higher-rent": {
      homePrice: DEFAULTS.homePrice,
      downPayment: DEFAULTS.downPayment,
      mortgageRate: DEFAULTS.mortgageRate,
      homeAppreciation: DEFAULTS.homeAppreciation,
      rentGrowth: 4.5,
      monthlyRent: DEFAULTS.monthlyRent + 300,
    },
  };

  const preset = presets[presetName] || presets.base;
  for (const [key, value] of Object.entries(preset)) {
    fields[key].set(value);
  }
}

function renderFrequencyDetail(result) {
  const el = document.getElementById("frequency-detail");
  const p = result.paymentPlan;
  const freq = PAYMENT_FREQUENCIES[p.frequency];
  const per = p.frequency === "monthly"
    ? `${formatMoney(p.perPayment)}/mo`
    : `${formatMoney(p.perPayment)} every ${freq.every} (≈ ${formatMoney(p.monthlyEquivalent)}/mo)`;

  const sooner = p.contractedAmortYears - p.payoffYears;
  const payoff = sooner > 0.05
    ? `pays off in ${p.payoffYears.toFixed(1)} yrs — ${sooner.toFixed(1)} yrs sooner`
    : `${p.contractedAmortYears}-yr amortization`;

  el.textContent = `${per} · ${payoff}`;
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
  const winnerLabel = result.winner === "rent" ? "Renting + investing" : "Buying";
  const diffLabel = result.winner === "rent" ? "more" : "less";
  const diffText = formatMoney(result.diff, { compact: true });
  el.textContent = `${winnerLabel} comes out ahead by about ${diffText} after ${horizonYears} yr${horizonYears === 1 ? "" : "s"}`;
  el.className = result.winner === "rent" ? "winner-rent" : "winner-buy";
  sub.textContent = `At the end of the period, buying is worth ${formatMoney(result.finalOwner, { compact: true })}, while renting and investing is worth ${formatMoney(result.finalRenter, { compact: true })}.`;
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
      <div class="row"><span>Land transfer tax (BC PTT)</span><span><s>${formatMoney(result.rawPtt)}</s> ${formatMoney(result.ptt)}</span></div>
      <p class="note">First-time buyer rebate saves ${formatMoney(result.pttExemption)} on the land transfer tax.</p>
    `;
  } else {
    pttRow = `<div class="row"><span>Land transfer tax (BC PTT)</span><span>${formatMoney(result.ptt)}</span></div>`;
  }
  const cmhcNote = result.cmhc?.premium > 0
    ? `<p class="note">CMHC insurance is financed into the mortgage balance, so it increases your loan size and monthly payment even though it is not a separate upfront cash cost.</p>`
    : "";
  body.innerHTML = `
    <div class="row"><span>Down payment</span><span>${formatMoney(result.downPayment)}</span></div>
    ${pttRow}
    <div class="row"><span>Legal + inspection</span><span>${formatMoney(result.legalInspectionCost)}</span></div>
    <div class="row"><strong>Total cash needed</strong><strong>${formatMoney(result.cashNeededToClose)}</strong></div>
    ${cmhcNote}
    <p class="note">Other Vancouver-area closing costs that are commonly missed include appraisal/title fees, moving costs, utility hookups, and strata/document review fees.</p>
  `;
}

function renderMonthlyCard(result) {
  const body = document.querySelector("#card-monthly .breakdown-body");
  const b = result.monthlyBreakdown;
  const rent = result.renterMonthlyFlow.monthlyRent;
  const housing = b.total;
  const diff = housing - rent; // + = owning costs more than renting
  const ownsMore = diff >= 0;
  const principalNote = b.principal > 0
    ? `<p class="note">About ${formatMoney(b.principal)}/mo of the owning cost is principal — forced savings that builds your equity, not money spent.</p>`
    : "";
  const pp = result.paymentPlan;
  const freqNote = pp.frequency !== "monthly"
    ? `<p class="note">P&amp;I is the monthly equivalent of your ${PAYMENT_FREQUENCIES[pp.frequency].label.toLowerCase()} payments (${formatMoney(pp.perPayment)} every ${PAYMENT_FREQUENCIES[pp.frequency].every}).</p>`
    : "";

  body.innerHTML = `
    <div class="row"><span>Mortgage payment (P&amp;I)</span><span>${formatMoney(b.pi)}</span></div>
    <div class="row row-indent"><span>• Principal (builds equity)</span><span>${formatMoney(b.principal)}</span></div>
    <div class="row row-indent"><span>• Interest</span><span>${formatMoney(b.interest)}</span></div>
    <div class="row"><span>Property tax</span><span>${formatMoney(b.tax)}</span></div>
    <div class="row"><span>Hydro / Gas</span><span>${formatMoney(b.heat)}</span></div>
    <div class="row"><span>Home insurance</span><span>${formatMoney(b.insurance)}</span></div>
    <div class="row"><span>Maintenance</span><span>${formatMoney(b.maintenance)}</span></div>
    <div class="row"><span>Condo/strata</span><span>${formatMoney(b.condo)}</span></div>
    <div class="row row-total"><span>Total monthly housing cost</span><span>${formatMoney(housing)}</span></div>
    ${freqNote}

    <div class="compare-block">
      <p class="subhead">Owning vs. renting — per month</p>
      <div class="row"><span>Own (all-in housing)</span><span>${formatMoney(housing)}</span></div>
      <div class="row"><span>Rent (comparable)</span><span>${formatMoney(rent)}</span></div>
      <div class="compare-verdict ${ownsMore ? "compare-own-more" : "compare-own-less"}">
        Owning costs <strong>${formatMoney(Math.abs(diff))}/mo ${ownsMore ? "more" : "less"}</strong> than renting
      </div>
      ${principalNote}
    </div>
  `;
}

function renderGdsCard(result) {
  const body = document.querySelector("#card-gds .breakdown-body");
  if (result.gds == null) {
    body.innerHTML = `<p class="note">Add your gross household income under ⚙️ Assumptions to see whether a lender would approve this — and how much room you'd have.</p>`;
    return;
  }
  const ratio = result.gds;
  const pct = ratio * 100;
  const capPct = GDS_MAX_RATIO * 100;
  const grossMonthly = result.grossIncome / 12;
  const gdsMonthly = result.gdsMonthlyCost;
  const capMonthly = GDS_MAX_RATIO * grossMonthly;
  const headroom = capMonthly - gdsMonthly; // + = room to spare, - = over the cap

  let verdictClass, badgeClass, verdictText;
  if (ratio > GDS_MAX_RATIO + 0.03) {
    verdictClass = "verdict-bad"; badgeClass = "badge-bad"; verdictText = "Over the lender limit";
  } else if (ratio > GDS_MAX_RATIO) {
    verdictClass = "verdict-warn"; badgeClass = "badge-warn"; verdictText = "Slightly over the cap";
  } else {
    verdictClass = "verdict-good"; badgeClass = "badge-good"; verdictText = "Within lender limits";
  }

  const headroomRow = headroom >= 0
    ? `<div class="row"><span>Room before the cap</span><span class="pos">+${formatMoney(headroom)}/mo</span></div>`
    : `<div class="row"><span>Over the cap by</span><span class="neg">${formatMoney(Math.abs(headroom))}/mo</span></div>`;

  body.innerHTML = `
    <div class="gds-verdict ${verdictClass}">
      <span class="badge ${badgeClass}">${verdictText}</span>
      <span class="gds-pct">${formatPercent(pct)}</span>
    </div>
    <p class="gds-explain"><strong>${formatPercent(pct)}</strong> of your gross (pre-tax) income would go to core housing costs. Lenders cap this at <strong>${formatPercent(capPct, 0)}</strong> when sizing your mortgage.</p>
    <div class="row"><span>Housing counted (GDS)</span><span>${formatMoney(gdsMonthly)}/mo</span></div>
    <div class="row"><span>Gross income</span><span>${formatMoney(grossMonthly)}/mo</span></div>
    ${headroomRow}
    <p class="note">GDS counts mortgage P&amp;I + property tax + hydro/gas + 50% of condo fees (not insurance or maintenance). Above ${formatPercent(capPct, 0)}, many lenders won't approve without a bigger down payment or co-signer.</p>
  `;
}

function renderMiscTotal(result) {
  const other = MISC_FIELDS.reduce((sum, { key }) => sum + fields[key].get(), 0);
  const housing = result?.monthlyBreakdown?.total ?? 0;
  document.getElementById("misc-total").innerHTML = `
    <div class="row"><span>Ownership costs</span><span>${formatMoney(housing)}/mo</span></div>
    <div class="row"><span>Other monthly expenses</span><span>${formatMoney(other)}/mo</span></div>
    <div class="row row-total"><span>Total monthly outlay</span><span>${formatMoney(housing + other)}/mo</span></div>
  `;
}

function renderYearlyCashFlow(result) {
  const table = document.getElementById("cash-flow-table");
  const rows = result.yearlyCashFlow.map((row) => `
    <tr>
      <td>${row.year}</td>
      <td>${formatMoney(row.ownerCost, { compact: true })}</td>
      <td>${formatMoney(row.rentCost, { compact: true })}</td>
      <td>${formatMoney(row.investmentContribution, { compact: true })}</td>
      <td>${formatMoney(row.ownerNetWorth, { compact: true })}</td>
      <td>${formatMoney(row.renterNetWorth, { compact: true })}</td>
    </tr>
  `).join("");

  table.innerHTML = `
    <thead>
      <tr>
        <th>Yr</th>
        <th>Own cost</th>
        <th>Rent</th>
        <th>Invest</th>
        <th>Buy NW</th>
        <th>Rent NW</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

function renderAmortizationSchedule(result) {
  const table = document.getElementById("amortization-table");
  const rows = result.amortizationSchedule.map((row) => `
    <tr>
      <td>${row.year}</td>
      <td>${formatMoney(row.startBalance, { compact: true })}</td>
      <td>${formatMoney(row.principal, { compact: true })}</td>
      <td>${formatMoney(row.interest, { compact: true })}</td>
      <td>${formatMoney(row.endBalance, { compact: true })}</td>
    </tr>
  `).join("");

  table.innerHTML = `
    <thead>
      <tr>
        <th>Yr</th>
        <th>Start</th>
        <th>Principal</th>
        <th>Interest</th>
        <th>End</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}
