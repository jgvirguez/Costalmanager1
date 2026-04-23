/**
 * Landed Cost Calculation Utilities
 * Following Specifications Section 3: Valoración de Inventario
 */

export interface LandedCostInput {
  fobPrice: number;
  weightKg: number;
}

export interface ImportExpenses {
  totalFreight: number;
  totalInsurance: number;
  totalWeight: number;
  totalFobValue: number;
}

/**
 * Prorrates freight by weight and insurance by value.
 * Algorithm: FinalCost = FOB + (ItemWeight/TotalWeight * TotalFreight) + (ItemFob/TotalFob * TotalInsurance)
 */
export const calculateLandedCost = (
  item: LandedCostInput,
  expenses: ImportExpenses
): number => {
  if (expenses.totalWeight === 0 || expenses.totalFobValue === 0) return item.fobPrice;

  const freightProrrate = (item.weightKg / expenses.totalWeight) * expenses.totalFreight;
  const insuranceProrrate = (item.fobPrice / expenses.totalFobValue) * expenses.totalInsurance;

  return item.fobPrice + freightProrrate + insuranceProrrate;
};

/**
 * Format to 8 decimals for Unit Cost (Using comma as decimal separator)
 */
export const formatUnitCost = (value: number): string => {
  return value.toLocaleString('es-VE', {
    minimumFractionDigits: 8,
    maximumFractionDigits: 8,
  });
};

/**
 * Format to 3 decimals for Quantity/Weight (Using comma as decimal separator)
 */
 export const formatQuantity = (value: number): string => {
  return value.toLocaleString('es-VE', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
};
