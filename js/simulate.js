import {
  cmhcInsurance,
  bcPropertyTransferTax,
  monthlyPayment,
  remainingBalance,
  gdsRatio,
  applyCapitalGainsTax,
} from "./finance.js";
import { CMHC_STANDARD_MAX_AMORT_YEARS } from "./constants.js";

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
    sellingCostRate,
    legalInspectionCost,
    marginalTaxRate,
    taxMode,
  } = inputs;

  const cmhc = cmhcInsurance(homePrice, downPayment);
  const loanPrincipal = cmhc.loanAmount + (cmhc.status === "insured" ? cmhc.premium : 0);
  const pmt = monthlyPayment(loanPrincipal, mortgageRate, amortizationYears);

  const ptt = bcPropertyTransferTax(homePrice);
  const closingCosts = ptt + legalInspectionCost;
  const initialLumpSum = downPayment + closingCosts;

  // Day-1 monthly breakdown, used for both the GDS check and the UI's cost card.
  const monthlyBreakdown = {
    pi: pmt,
    tax: (homePrice * propertyTaxRate) / 100 / 12,
    heat: heatingMonthly,
    insurance: homeInsuranceMonthly,
    maintenance: (homePrice * maintenanceRate) / 100 / 12,
    condo: condoFeeMonthly,
  };
  monthlyBreakdown.total =
    monthlyBreakdown.pi +
    monthlyBreakdown.tax +
    monthlyBreakdown.heat +
    monthlyBreakdown.insurance +
    monthlyBreakdown.maintenance +
    monthlyBreakdown.condo;

  const gds = gdsRatio({
    monthlyPI: monthlyBreakdown.pi,
    monthlyPropertyTax: monthlyBreakdown.tax,
    monthlyHeating: monthlyBreakdown.heat,
    monthlyCondoFee: monthlyBreakdown.condo,
    grossAnnualIncome: grossIncome,
  });

  const years = [0];
  const ownerNetWorth = [homePrice - (homePrice * sellingCostRate) / 100 - loanPrincipal];

  let renterPortfolio = initialLumpSum;
  let totalContributions = initialLumpSum;
  const renterNetWorth = [applyCapitalGainsTax(renterPortfolio, totalContributions, taxMode, marginalTaxRate)];

  for (let year = 1; year <= horizonYears; year++) {
    const homeValue = homePrice * Math.pow(1 + homeAppreciation / 100, year);
    const monthsElapsed = Math.min(year * 12, amortizationYears * 12);
    const balance = remainingBalance(loanPrincipal, mortgageRate, amortizationYears, monthsElapsed);

    const annualPI = year <= amortizationYears ? pmt * 12 : 0;
    const annualTax = (homeValue * propertyTaxRate) / 100;
    const annualHeat = heatingMonthly * 12;
    const annualInsurance = homeInsuranceMonthly * 12;
    const annualMaint = (homeValue * maintenanceRate) / 100;
    const annualCondo = condoFeeMonthly * 12;
    const ownerCashCost = annualPI + annualTax + annualHeat + annualInsurance + annualMaint + annualCondo;

    const rentThisYear = monthlyRent * 12 * Math.pow(1 + rentGrowth / 100, year - 1);

    // Simplification: if rent exceeds the owner's cash cost, the renter contributes
    // $0 extra that year rather than modeling a shortfall invested from elsewhere.
    const contribution = Math.max(0, ownerCashCost - rentThisYear);
    renterPortfolio = renterPortfolio * (1 + investReturn / 100) + contribution;
    totalContributions += contribution;

    years.push(year);
    ownerNetWorth.push(homeValue - (homeValue * sellingCostRate) / 100 - balance);
    // Tax adjustment applied every year (not just at the horizon) so both curves stay
    // consistent "sell/liquidate today" net-worth lines throughout the chart.
    renterNetWorth.push(applyCapitalGainsTax(renterPortfolio, totalContributions, taxMode, marginalTaxRate));
  }

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
    cmhc,
    ptt,
    closingCosts,
    monthlyBreakdown,
    gds,
    amortizationCaveat: cmhc.status === "insured" && amortizationYears > CMHC_STANDARD_MAX_AMORT_YEARS,
  };
}
