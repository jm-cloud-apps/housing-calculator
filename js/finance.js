import {
  CMHC_PREMIUM_TIERS,
  CMHC_MAX_INSURABLE_PRICE,
  BC_PTT_BRACKETS,
  BC_FTHB_EXEMPTION_BASE_PRICE,
  BC_FTHB_FULL_EXEMPTION_MAX,
  BC_FTHB_PHASEOUT_MAX,
} from "./constants.js";

// Canadian mortgages compound semi-annually, not monthly — this is NOT the US formula.
// Effective rate per payment period for `perYear` payments/year (12=monthly, 24=semi-monthly,
// 26=biweekly, 52=weekly).
export function effectivePeriodicRate(annualRatePct, perYear) {
  const j = annualRatePct / 100;
  return Math.pow(1 + j / 2, 2 / perYear) - 1;
}

export function effectiveMonthlyRate(annualRatePct) {
  return effectivePeriodicRate(annualRatePct, 12);
}

// Payment frequencies. `factor` is the per-payment amount as a multiple of the standard
// monthly payment: non-accelerated splits the monthly total across more payments (same
// annual total), while accelerated pays half/quarter the monthly amount every period, which
// works out to ~13 monthly payments a year and shortens the amortization.
export const PAYMENT_FREQUENCIES = {
  monthly: { label: "Monthly", perYear: 12, factor: 1, every: "month", accelerated: false },
  semi_monthly: { label: "Semi-monthly", perYear: 24, factor: 1 / 2, every: "½ month", accelerated: false },
  biweekly: { label: "Biweekly", perYear: 26, factor: 12 / 26, every: "2 weeks", accelerated: false },
  accelerated_biweekly: { label: "Accelerated biweekly", perYear: 26, factor: 1 / 2, every: "2 weeks", accelerated: true },
  weekly: { label: "Weekly", perYear: 52, factor: 12 / 52, every: "week", accelerated: false },
  accelerated_weekly: { label: "Accelerated weekly", perYear: 52, factor: 1 / 4, every: "week", accelerated: true },
};

// Standard amortization payment formula, fed the Canadian effective monthly rate above.
export function monthlyPayment(principal, annualRatePct, amortYears) {
  const i = effectiveMonthlyRate(annualRatePct);
  const n = amortYears * 12;
  if (n <= 0) return 0;
  if (i === 0) return principal / n;
  return (principal * i) / (1 - Math.pow(1 + i, -n));
}

// Remaining balance after `monthsElapsed` payments of a fixed-payment amortizing loan.
export function remainingBalance(principal, annualRatePct, amortYears, monthsElapsed) {
  const i = effectiveMonthlyRate(annualRatePct);
  const n = amortYears * 12;
  if (monthsElapsed >= n) return 0;
  const pmt = monthlyPayment(principal, annualRatePct, amortYears);
  if (i === 0) return Math.max(0, principal - pmt * monthsElapsed);
  return principal * Math.pow(1 + i, monthsElapsed) - pmt * ((Math.pow(1 + i, monthsElapsed) - 1) / i);
}

// Amortizes a loan at a given payment frequency and returns the per-payment amount, its
// monthly-equivalent cash cost, the actual payoff time (shorter than the contracted
// amortization for accelerated frequencies), total interest, and a per-year schedule.
// `baseMonthly` is the standard monthly payment lenders qualify you on.
export function mortgagePlan(principal, annualRatePct, amortYears, frequencyKey) {
  const freq = PAYMENT_FREQUENCIES[frequencyKey] ? frequencyKey : "monthly";
  const { perYear, factor } = PAYMENT_FREQUENCIES[freq];
  const baseMonthly = monthlyPayment(principal, annualRatePct, amortYears);
  const perPayment = baseMonthly * factor;
  const i = effectivePeriodicRate(annualRatePct, perYear);

  const yearly = [];
  let balance = principal;
  let totalInterest = 0;
  let payoffPeriods = 0;

  for (let year = 1; year <= amortYears && balance > 0.005; year++) {
    const startBalance = balance;
    let yearPrincipal = 0;
    let yearInterest = 0;
    for (let p = 0; p < perYear && balance > 0.005; p++) {
      const interest = balance * i;
      let principalPaid = perPayment - interest;
      if (principalPaid <= 0) break; // payment doesn't cover interest (edge case) — stop
      if (principalPaid > balance) principalPaid = balance;
      balance = Math.max(0, balance - principalPaid);
      yearPrincipal += principalPaid;
      yearInterest += interest;
      totalInterest += interest;
      payoffPeriods++;
    }
    yearly.push({ year, startBalance, principal: yearPrincipal, interest: yearInterest, endBalance: balance });
    if (yearPrincipal === 0) break; // non-amortizing — avoid an infinite outer loop
  }

  return {
    frequency: freq,
    perYear,
    perPayment,
    baseMonthly,
    monthlyEquivalent: (perPayment * perYear) / 12,
    payoffYears: perYear > 0 ? payoffPeriods / perYear : amortYears,
    totalInterest,
    yearly,
  };
}

// Minimum down payment required for an insurable mortgage at this price (tiered rule):
// 5% on the first $500,000, plus 10% on the portion above that.
export function minInsurableDownPayment(price) {
  if (price <= 500_000) return price * 0.05;
  return 500_000 * 0.05 + (price - 500_000) * 0.1;
}

// CMHC eligibility + premium. Returns a result object rather than throwing, so the UI
// can render each state (conventional / insured / ineligible) without try/catch.
export function cmhcInsurance(price, downPayment) {
  const loanAmount = Math.max(0, price - downPayment);
  const ltv = price > 0 ? loanAmount / price : 0;
  const downPaymentPct = price > 0 ? downPayment / price : 0;

  if (downPaymentPct >= 0.2) {
    return { status: "conventional", premiumRate: 0, premium: 0, loanAmount, ltv };
  }
  if (price >= CMHC_MAX_INSURABLE_PRICE) {
    return {
      status: "ineligible",
      premiumRate: 0,
      premium: 0,
      loanAmount,
      ltv,
      reason: "Not eligible for an insured mortgage — 20%+ down payment required at this price.",
    };
  }
  const tier = CMHC_PREMIUM_TIERS.find((t) => ltv <= t.maxLtv);
  if (!tier) {
    return {
      status: "ineligible",
      premiumRate: 0,
      premium: 0,
      loanAmount,
      ltv,
      reason: "Down payment is below the minimum insurable threshold.",
    };
  }
  const premium = loanAmount * tier.rate; // no PST in BC on mortgage default insurance
  return {
    status: "insured",
    premiumRate: tier.rate,
    premium,
    loanAmount,
    ltv,
    belowMinimum: downPayment < minInsurableDownPayment(price),
  };
}

// BC Property Transfer Tax — marginal bracket calculation.
export function bcPropertyTransferTax(price) {
  let tax = 0;
  let lower = 0;
  for (const { upTo, rate } of BC_PTT_BRACKETS) {
    if (price <= lower) break;
    tax += (Math.min(price, upTo) - lower) * rate;
    lower = upTo;
  }
  return tax;
}

// BC First Time Home Buyers' Program: how much of the PTT otherwise owed is exempted.
// The exemption is capped at the PTT on the first $500k (≈$8,000) — it is NOT a waiver of
// the whole tax for pricier homes. Full for homes ≤ $500k (where the whole PTT is ≤ the
// cap), flat cap from $500k–$835k, then the cap phases linearly to $0 by $860k.
export function firstTimeBuyerPttExemption(price, rawTax) {
  if (price >= BC_FTHB_PHASEOUT_MAX) return 0;
  const maxExemption = bcPropertyTransferTax(BC_FTHB_EXEMPTION_BASE_PRICE);
  const cappedExemption = Math.min(rawTax, maxExemption);
  if (price <= BC_FTHB_FULL_EXEMPTION_MAX) return cappedExemption;
  const ratio = (BC_FTHB_PHASEOUT_MAX - price) / (BC_FTHB_PHASEOUT_MAX - BC_FTHB_FULL_EXEMPTION_MAX);
  return cappedExemption * ratio;
}

// GDS = (monthly P&I + monthly property tax + monthly heating + 50% monthly condo fee)
// x 12 / gross annual income. Returns { ratio, monthlyCost } so callers can show both the
// percentage and the dollars behind it; returns null when income is 0/blank (N/A).
export function gdsRatio({ monthlyPI, monthlyPropertyTax, monthlyHeating, monthlyCondoFee, grossAnnualIncome }) {
  if (!grossAnnualIncome) return null;
  const monthlyCost = monthlyPI + monthlyPropertyTax + monthlyHeating + 0.5 * monthlyCondoFee;
  return { ratio: (monthlyCost * 12) / grossAnnualIncome, monthlyCost };
}

// Applies capital-gains tax (taxable mode only) to unrealized gains, at the 50% inclusion rate.
// TFSA mode is a no-op: no tax on gains, ever.
export function applyCapitalGainsTax(portfolioValue, totalContributions, taxMode, marginalTaxRatePct) {
  if (taxMode === "tfsa") return portfolioValue;
  const gain = Math.max(0, portfolioValue - totalContributions);
  const taxableGain = gain * 0.5;
  const tax = taxableGain * (marginalTaxRatePct / 100);
  return portfolioValue - tax;
}

export function formatMoney(value, { compact = false } = {}) {
  if (compact) {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${value < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
    if (abs >= 1_000) return `${value < 0 ? "-" : ""}$${(abs / 1_000).toFixed(0)}K`;
    return `${value < 0 ? "-" : ""}$${abs.toFixed(0)}`;
  }
  return value.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
}

export function formatPercent(value, digits = 1) {
  return `${value.toFixed(digits)}%`;
}
