// Default slider/field values. All prices in CAD.
export const DEFAULTS = {
  homePrice: 550_000,
  downPayment: 27_500, // 5%
  monthlyRent: 2_600,
  grossIncome: 60_000, // optional; 0 hides the GDS check
  mortgageRate: 5.15, // % nominal annual, semi-annual compounding — illustrative only, not a live rate
  amortizationYears: 25,
  investReturn: 8, // % nominal annual
  horizonYears: 25,
  rentGrowth: 3, // %/yr
  homeAppreciation: 3, // %/yr
  propertyTaxRate: 0.3, // %/yr of current home value
  homeInsuranceMonthly: 100,
  maintenanceRate: 1, // %/yr of current home value (excluded from GDS)
  heatingMonthly: 100,
  condoFeeMonthly: 0,
  sellingCostRate: 4, // % of future home value, paid on exit
  legalInspectionCost: 1_500, // flat, one-time closing cost
  marginalTaxRate: 30, // % — only used in 'taxable' tax mode
  taxMode: "tfsa", // 'tfsa' | 'taxable'
};

// min/max/step for each slider+number field.
export const RANGES = {
  homePrice: { min: 200_000, max: 2_000_000, step: 5_000 },
  downPayment: { min: 0, max: 2_000_000, step: 500 },
  monthlyRent: { min: 500, max: 10_000, step: 50 },
  grossIncome: { min: 0, max: 500_000, step: 1_000 },
  mortgageRate: { min: 0, max: 12, step: 0.05 },
  amortizationYears: { min: 5, max: 30, step: 1 },
  investReturn: { min: 0, max: 15, step: 0.1 },
  horizonYears: { min: 1, max: 30, step: 1 },
  rentGrowth: { min: 0, max: 10, step: 0.1 },
  homeAppreciation: { min: -5, max: 10, step: 0.1 },
  propertyTaxRate: { min: 0, max: 2, step: 0.01 },
  homeInsuranceMonthly: { min: 0, max: 1_000, step: 10 },
  maintenanceRate: { min: 0, max: 5, step: 0.1 },
  heatingMonthly: { min: 0, max: 1_000, step: 10 },
  condoFeeMonthly: { min: 0, max: 2_000, step: 25 },
  sellingCostRate: { min: 0, max: 10, step: 0.1 },
  legalInspectionCost: { min: 0, max: 10_000, step: 100 },
  marginalTaxRate: { min: 0, max: 55, step: 1 },
};

// Labels + grouping metadata, used to stamp field markup in ui.js.
export const PRIMARY_FIELDS = [
  { key: "homePrice", label: "Home price", prefix: "$" },
  { key: "downPayment", label: "Down payment", prefix: "$", showPercentOf: "homePrice" },
  { key: "monthlyRent", label: "Comparable monthly rent", prefix: "$", suffix: "/mo" },
  { key: "mortgageRate", label: "Mortgage rate", suffix: "%" },
  { key: "horizonYears", label: "Time horizon", suffix: " yrs" },
];

export const ADVANCED_FIELDS = [
  { key: "grossIncome", label: "Gross household income (for GDS check)", prefix: "$", suffix: "/yr" },
  { key: "amortizationYears", label: "Amortization", suffix: " yrs" },
  { key: "investReturn", label: "Investment return (VFV/S&P 500)", suffix: "%/yr" },
  { key: "rentGrowth", label: "Rent growth", suffix: "%/yr" },
  { key: "homeAppreciation", label: "Home appreciation", suffix: "%/yr" },
  { key: "propertyTaxRate", label: "Property tax rate", suffix: "%/yr" },
  { key: "homeInsuranceMonthly", label: "Home insurance", prefix: "$", suffix: "/mo" },
  { key: "maintenanceRate", label: "Maintenance", suffix: "%/yr" },
  { key: "heatingMonthly", label: "Heating", prefix: "$", suffix: "/mo" },
  { key: "condoFeeMonthly", label: "Condo/strata fee", prefix: "$", suffix: "/mo" },
  { key: "sellingCostRate", label: "Selling costs on exit", suffix: "%" },
  { key: "legalInspectionCost", label: "Legal + inspection (one-time)", prefix: "$" },
  { key: "marginalTaxRate", label: "Marginal tax rate (taxable mode)", suffix: "%" },
];

// CMHC premium tiers — LTV upper bound (inclusive) -> premium rate on loan amount.
// Ordered ascending; first match wins. A 90.01-95% LTV loan funded by a non-traditional
// down payment source (e.g. unsecured line of credit) carries 4.50% instead of 4.00% —
// footnote only, not modeled as a separate UI toggle.
export const CMHC_PREMIUM_TIERS = [
  { maxLtv: 0.65, rate: 0.006 },
  { maxLtv: 0.75, rate: 0.017 },
  { maxLtv: 0.8, rate: 0.024 },
  { maxLtv: 0.85, rate: 0.028 },
  { maxLtv: 0.9, rate: 0.031 },
  { maxLtv: 0.95, rate: 0.04 },
];

export const CMHC_MAX_INSURABLE_PRICE = 1_500_000;
export const CMHC_STANDARD_MAX_AMORT_YEARS = 25;
export const CMHC_EXTENDED_MAX_AMORT_YEARS = 30; // first-time buyers / new builds only (Dec-2024 rule)
export const GDS_MAX_RATIO = 0.39;

// BC Property Transfer Tax brackets (marginal, cumulative). The 5% top bracket
// models "3% + a further 2% surcharge on the residential portion above $3,000,000"
// as a flat marginal rate, valid as long as the whole property is residential.
export const BC_PTT_BRACKETS = [
  { upTo: 200_000, rate: 0.01 },
  { upTo: 2_000_000, rate: 0.02 },
  { upTo: 3_000_000, rate: 0.03 },
  { upTo: Infinity, rate: 0.05 },
];
