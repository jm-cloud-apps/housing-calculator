import {
  cmhcInsurance,
  bcPropertyTransferTax,
  firstTimeBuyerPttExemption,
  mortgagePlan,
  gdsRatio,
  applyCapitalGainsTax,
} from "./finance.js";
import { CMHC_STANDARD_MAX_AMORT_YEARS } from "./constants.js";

// First index where the owner/renter net-worth lines cross; linearly interpolates the
// fractional year and value at the crossing. Returns null if they never cross.
function findBreakeven(years, ownerSeries, renterSeries) {
  for (let i = 1; i < years.length; i++) {
    const prevDiff = ownerSeries[i - 1] - renterSeries[i - 1];
    const currDiff = ownerSeries[i] - renterSeries[i];
    if (prevDiff === 0) return { year: years[i - 1], value: ownerSeries[i - 1] };
    if ((prevDiff < 0 && currDiff > 0) || (prevDiff > 0 && currDiff < 0)) {
      const t = Math.abs(prevDiff) / (Math.abs(prevDiff) + Math.abs(currDiff));
      return {
        year: years[i - 1] + t * (years[i] - years[i - 1]),
        value: ownerSeries[i - 1] + t * (ownerSeries[i] - ownerSeries[i - 1]),
      };
    }
  }
  return null;
}

// Year-by-year projection, not month-by-month: the mortgage math still compounds
// monthly internally (see finance.js), but netting the owner-cost-vs-rent investing
// decision once a year is accurate enough for a multi-year comparison and keeps this
// loop trivial to reason about (at most 30 iterations).
export function runSimulation(inputs) {
  const {
    homePrice,
    downPayment,
    monthlyRent,
    grossIncome,
    mortgageRate,
    amortizationYears,
    investReturn,
    horizonYears,
    rentGrowth,
    homeAppreciation,
    propertyTaxRate,
    homeInsuranceMonthly,
    maintenanceRate,
    heatingMonthly,
    condoFeeMonthly,
    legalInspectionCost,
    marginalTaxRate,
    taxMode,
    isFirstTimeBuyer,
    paymentFrequency,
  } = inputs;

  const cmhc = cmhcInsurance(homePrice, downPayment);
  const loanPrincipal = cmhc.loanAmount + (cmhc.status === "insured" ? cmhc.premium : 0);
  const plan = mortgagePlan(loanPrincipal, mortgageRate, amortizationYears, paymentFrequency);
  const planFirstYear = plan.yearly[0] || { principal: 0, interest: 0 };

  const rawPtt = bcPropertyTransferTax(homePrice);
  const pttExemption = isFirstTimeBuyer ? firstTimeBuyerPttExemption(homePrice, rawPtt) : 0;
  const ptt = rawPtt - pttExemption;
  const closingCosts = ptt + legalInspectionCost;
  // What the buyer spends upfront — also the renter's opportunity-cost starting capital.
  const cashNeededToClose = downPayment + closingCosts;

  // Day-1 monthly breakdown, used for the UI's cost card. P&I is the monthly-equivalent
  // cash cost of the chosen frequency (year-1 average), so it's comparable to rent.
  const monthlyBreakdown = {
    pi: (planFirstYear.principal + planFirstYear.interest) / 12,
    principal: planFirstYear.principal / 12,
    interest: planFirstYear.interest / 12,
    tax: propertyTaxRate,
    heat: heatingMonthly,
    insurance: homeInsuranceMonthly,
    maintenance: maintenanceRate,
    condo: condoFeeMonthly,
  };
  monthlyBreakdown.total =
    monthlyBreakdown.pi +
    monthlyBreakdown.tax +
    monthlyBreakdown.heat +
    monthlyBreakdown.insurance +
    monthlyBreakdown.maintenance +
    monthlyBreakdown.condo;

  // Lenders qualify GDS on the standard monthly payment, not the accelerated cash cost.
  const gdsResult = gdsRatio({
    monthlyPI: plan.baseMonthly,
    monthlyPropertyTax: monthlyBreakdown.tax,
    monthlyHeating: monthlyBreakdown.heat,
    monthlyCondoFee: monthlyBreakdown.condo,
    grossAnnualIncome: grossIncome,
  });

  const firstYearOwnerCost = monthlyBreakdown.pi * 12 + monthlyBreakdown.tax * 12 + monthlyBreakdown.heat * 12 + monthlyBreakdown.insurance * 12 + monthlyBreakdown.maintenance * 12 + monthlyBreakdown.condo * 12;
  const firstYearRent = monthlyRent * 12;
  const firstYearInvestmentContribution = Math.max(0, firstYearOwnerCost - firstYearRent);

  const years = [0];
  const ownerNetWorth = [homePrice - loanPrincipal];
  const yearlyCashFlow = [];

  let renterPortfolio = cashNeededToClose;
  let totalContributions = cashNeededToClose;
  const renterNetWorth = [applyCapitalGainsTax(renterPortfolio, totalContributions, taxMode, marginalTaxRate)];

  for (let year = 1; year <= horizonYears; year++) {
    const homeValue = homePrice * Math.pow(1 + homeAppreciation / 100, year);
    // Beyond the payoff year the plan has no entry: balance 0, no P&I owed.
    const planYear = plan.yearly[year - 1];
    const balance = planYear ? planYear.endBalance : 0;

    const annualPI = planYear ? planYear.principal + planYear.interest : 0;
    const annualTax = propertyTaxRate * 12;
    const annualHeat = heatingMonthly * 12;
    const annualInsurance = homeInsuranceMonthly * 12;
    const annualMaint = maintenanceRate * 12;
    const annualCondo = condoFeeMonthly * 12;
    const ownerCashCost = annualPI + annualTax + annualHeat + annualInsurance + annualMaint + annualCondo;

    const rentThisYear = monthlyRent * 12 * Math.pow(1 + rentGrowth / 100, year - 1);

    // Simplification: if rent exceeds the owner's cash cost, the renter contributes
    // $0 extra that year rather than modeling a shortfall invested from elsewhere.
    const contribution = Math.max(0, ownerCashCost - rentThisYear);
    renterPortfolio = renterPortfolio * (1 + investReturn / 100) + contribution;
    totalContributions += contribution;

    years.push(year);
    ownerNetWorth.push(homeValue - balance);
    // Tax adjustment applied every year (not just at the horizon) so both curves stay
    // consistent "sell/liquidate today" net-worth lines throughout the chart.
    renterNetWorth.push(applyCapitalGainsTax(renterPortfolio, totalContributions, taxMode, marginalTaxRate));
    yearlyCashFlow.push({
      year,
      ownerCost: ownerCashCost,
      rentCost: rentThisYear,
      investmentContribution: contribution,
      ownerNetWorth: ownerNetWorth[ownerNetWorth.length - 1],
      renterNetWorth: renterNetWorth[renterNetWorth.length - 1],
    });
  }

  const amortizationSchedule = plan.yearly;

  const finalOwner = ownerNetWorth[ownerNetWorth.length - 1];
  const finalRenter = renterNetWorth[renterNetWorth.length - 1];
  const diff = Math.abs(finalOwner - finalRenter);
  const winner = finalRenter >= finalOwner ? "rent" : "buy";

  return {
    years,
    ownerNetWorth,
    renterNetWorth,
    finalOwner,
    finalRenter,
    winner,
    diff,
    breakeven: findBreakeven(years, ownerNetWorth, renterNetWorth),
    cmhc,
    ptt,
    rawPtt,
    pttExemption,
    closingCosts,
    cashNeededToClose,
    downPayment,
    legalInspectionCost,
    monthlyBreakdown,
    paymentPlan: {
      frequency: plan.frequency,
      perYear: plan.perYear,
      perPayment: plan.perPayment,
      baseMonthly: plan.baseMonthly,
      monthlyEquivalent: plan.monthlyEquivalent,
      payoffYears: plan.payoffYears,
      totalInterest: plan.totalInterest,
      contractedAmortYears: amortizationYears,
    },
    gds: gdsResult ? gdsResult.ratio : null,
    gdsMonthlyCost: gdsResult ? gdsResult.monthlyCost : null,
    grossIncome,
    yearlyCashFlow,
    amortizationSchedule,
    renterMonthlyFlow: {
      monthlyRent,
      monthlyInvestmentContribution: firstYearInvestmentContribution / 12,
      monthlyTotal: monthlyRent + firstYearInvestmentContribution / 12,
    },
    amortizationCaveat: cmhc.status === "insured" && amortizationYears > CMHC_STANDARD_MAX_AMORT_YEARS,
  };
}
