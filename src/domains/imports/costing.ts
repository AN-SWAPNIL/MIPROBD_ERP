import { Decimal } from "decimal.js";
import type {
  CostAllocation,
  ImportCostLine,
  ImportItem,
  LandedCostPreview,
  LandedCostProductResult
} from "../erp.types.js";

Decimal.set({ precision: 32, rounding: Decimal.ROUND_HALF_UP });

function decimal(value: string | number | undefined) {
  return new Decimal(value || 0);
}

function money(value: Decimal) {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function precise(value: Decimal) {
  return value.toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toFixed(8);
}

function allocateRounded(total: Decimal, weights: { itemId: string; weight: Decimal }[]) {
  if (weights.some((entry) => !entry.weight.isFinite() || entry.weight.lt(0))) throw new Error("Allocation weights must be finite and non-negative.");
  const weightTotal = weights.reduce((sum, entry) => sum.plus(entry.weight), new Decimal(0));
  if (weightTotal.lte(0)) {
    throw new Error("Allocation basis total must be greater than zero.");
  }

  const cents = total.mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const provisional = weights.map((entry) => {
    const rawCents = cents.mul(entry.weight).div(weightTotal);
    const floorCents = rawCents.floor();
    return { ...entry, rawCents, floorCents, remainder: rawCents.minus(floorCents) };
  });
  const remaining = cents.minus(provisional.reduce((sum, entry) => sum.plus(entry.floorCents), new Decimal(0))).toNumber();
  const ranked = [...provisional].sort((a, b) => {
    const remainderOrder = b.remainder.comparedTo(a.remainder);
    return remainderOrder || a.itemId.localeCompare(b.itemId);
  });
  const result = new Map(provisional.map((entry) => [entry.itemId, entry.floorCents]));

  for (let index = 0; index < remaining; index += 1) {
    const target = ranked[index % ranked.length];
    result.set(target.itemId, (result.get(target.itemId) ?? new Decimal(0)).plus(1));
  }

  return new Map([...result].map(([itemId, value]) => [itemId, value.div(100)]));
}

function eligibleItems(items: ImportItem[], cost: ImportCostLine) {
  if (!cost.appliesToItemIds.length) {
    return items;
  }
  return items.filter((item) => cost.appliesToItemIds.includes(item.id));
}

function convertedCost(cost: ImportCostLine) {
  if (cost.currency === "BDT") {
    return decimal(cost.amountForeign || cost.amountBdt);
  }
  return decimal(cost.amountForeign).mul(decimal(cost.exchangeRate));
}

function allocationWeights(items: ImportItem[], cost: ImportCostLine) {
  if (cost.allocationMethod === "CBM") {
    return items.map((item) => ({ itemId: item.id, weight: decimal(item.totalCbm), label: `${item.totalCbm} CBM` }));
  }
  if (cost.allocationMethod === "FOB_VALUE") {
    return items.map((item) => ({ itemId: item.id, weight: decimal(item.fobTotalBdt), label: `Tk ${item.fobTotalBdt} FOB` }));
  }
  if (cost.allocationMethod === "QUANTITY") {
    return items.map((item) => ({ itemId: item.id, weight: decimal(item.quantity), label: `${item.quantity} units` }));
  }
  if (cost.allocationMethod === "PRODUCT_SPECIFIC") {
    if (items.length !== 1) {
      throw new Error(`${cost.name}: product-specific cost must select exactly one product.`);
    }
    return [{ itemId: items[0].id, weight: new Decimal(1), label: "selected product" }];
  }
  return [];
}

export function calculateLandedCost(importId: string, items: ImportItem[], costs: ImportCostLine[]): LandedCostPreview {
  const validationErrors: string[] = [];
  const allocations: CostAllocation[] = [];
  if (new Set(items.map((item) => item.id)).size !== items.length) validationErrors.push("Import item IDs must be unique.");
  if (new Set(costs.map((cost) => cost.id)).size !== costs.length) validationErrors.push("Cost line IDs must be unique.");

  for (const item of items) {
    if (decimal(item.quantity).lte(0)) validationErrors.push(`${item.productName}: quantity must be greater than zero.`);
    if (decimal(item.fobTotalBdt).lt(0)) validationErrors.push(`${item.productName}: FOB value cannot be negative.`);
  }

  for (const cost of costs) {
    const eligible = eligibleItems(items, cost);
    const total = convertedCost(cost).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (cost.appliesToItemIds.some((id) => !items.some((item) => item.id === id))) {
      validationErrors.push(`${cost.name}: allocation scope contains an unknown product.`);
      continue;
    }
    if (cost.currency !== "BDT" && (!decimal(cost.exchangeRate).isFinite() || decimal(cost.exchangeRate).lte(0))) {
      validationErrors.push(`${cost.name}: exchange rate must be greater than zero.`);
      continue;
    }
    if (total.lte(0)) {
      validationErrors.push(`${cost.name}: amount must be greater than zero.`);
      continue;
    }
    if (!eligible.length) {
      validationErrors.push(`${cost.name}: select at least one applicable product.`);
      continue;
    }

    try {
      let rounded: Map<string, Decimal>;
      let basisLabels = new Map<string, string>();
      if (cost.allocationMethod === "MANUAL") {
        const manual = cost.manualSplits ?? [];
        if (new Set(manual.map((split) => split.importItemId)).size !== manual.length) throw new Error(`${cost.name}: duplicate manual split product.`);
        if (manual.some((split) => decimal(split.amountBdt).lt(0) || decimal(split.amountBdt).decimalPlaces() > 2)) throw new Error(`${cost.name}: manual amounts must be non-negative and have at most two decimals.`);
        const manualTotal = manual.reduce((sum, split) => sum.plus(decimal(split.amountBdt)), new Decimal(0));
        if (!manualTotal.eq(total)) throw new Error(`${cost.name}: manual split must equal Tk ${money(total)}.`);
        if (manual.some((split) => !eligible.some((item) => item.id === split.importItemId))) {
          throw new Error(`${cost.name}: manual split contains an ineligible product.`);
        }
        rounded = new Map(manual.map((split) => [split.importItemId, decimal(split.amountBdt)]));
        basisLabels = new Map(manual.map((split) => [split.importItemId, `Tk ${split.amountBdt} manual`]));
      } else {
        const weights = allocationWeights(eligible, cost);
        rounded = allocateRounded(total, weights);
        basisLabels = new Map(weights.map((entry) => [entry.itemId, entry.label]));
      }

      for (const item of eligible) {
        const allocated = rounded.get(item.id) ?? new Decimal(0);
        const share = total.eq(0) ? new Decimal(0) : allocated.div(total).mul(100);
        const perUnit = allocated.div(decimal(item.quantity).gt(0) ? decimal(item.quantity) : new Decimal(1));
        allocations.push({
          costLineId: cost.id,
          costName: cost.name,
          importItemId: item.id,
          productName: item.productName,
          method: cost.allocationMethod,
          basisValue: basisLabels.get(item.id) ?? "manual",
          sharePercent: precise(share),
          allocatedBdt: money(allocated),
          perUnitBdt: money(perUnit),
          explanation: `${cost.name}: Tk ${money(total)} allocated by ${cost.allocationMethod.replace("_", " ")} using ${basisLabels.get(item.id) ?? "manual split"}; ${precise(share)}% = Tk ${money(allocated)}, or Tk ${money(perUnit)} per unit.`
        });
      }
    } catch (error) {
      validationErrors.push(error instanceof Error ? error.message : `${cost.name}: allocation failed.`);
    }
  }

  const products: LandedCostProductResult[] = items.map((item) => {
    const quantity = decimal(item.quantity);
    const safeQuantity = quantity.gt(0) ? quantity : new Decimal(1);
    const fob = decimal(item.fobTotalBdt);
    const components = allocations.filter((allocation) => allocation.importItemId === item.id);
    const additional = components.reduce((sum, allocation) => sum.plus(decimal(allocation.allocatedBdt)), new Decimal(0));
    const total = fob.plus(additional);
    return {
      importItemId: item.id,
      productCode: item.productCode,
      productName: item.productName,
      quantity: item.quantity,
      fobTotalBdt: money(fob),
      fobPerUnitBdt: money(fob.div(safeQuantity)),
      additionalCostBdt: money(additional),
      additionalPerUnitBdt: money(additional.div(safeQuantity)),
      finalTotalBdt: money(total),
      finalPerUnitBdt: money(total.div(safeQuantity)),
      authoritativeUnitCostBdt: total.div(safeQuantity).toFixed(10),
      components
    };
  });
  const productValue = items.reduce((sum, item) => sum.plus(decimal(item.fobTotalBdt)), new Decimal(0));
  const additional = allocations.reduce((sum, allocation) => sum.plus(decimal(allocation.allocatedBdt)), new Decimal(0));

  return {
    importId,
    totalProductValueBdt: money(productValue),
    totalAdditionalCostBdt: money(additional),
    totalShipmentCostBdt: money(productValue.plus(additional)),
    products,
    allocations,
    validationErrors
  };
}

export function importDisplayReference(record: { draftReference: string; paymentMode: "Pending" | "LC" | "TT"; lcNumber?: string; ttReference?: string }) {
  if (record.paymentMode === "LC" && record.lcNumber?.trim()) return record.lcNumber.trim();
  if (record.paymentMode === "TT" && record.ttReference?.trim()) return record.ttReference.trim();
  return record.draftReference;
}
