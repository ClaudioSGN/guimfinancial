import Big from "big.js";

export function computeTotal(quantity: Big, pricePerShare: Big) {
  return quantity.times(pricePerShare);
}

export function computeQuantityFromValue(
  investedValue: Big,
  pricePerShare: Big,
  decimals: number,
) {
  const raw = investedValue.div(pricePerShare);
  const quantity =
    decimals > 0 ? raw.round(decimals, Big.roundDown) : raw.round(0, Big.roundDown);
  const total = quantity.times(pricePerShare);
  return { quantity, total };
}

export function computeNewAveragePrice(
  currentQuantity: Big,
  currentAverage: Big,
  purchaseQuantity: Big,
  purchasePrice: Big,
) {
  if (currentQuantity.lte(0)) {
    return purchasePrice;
  }
  const totalCost = currentQuantity.times(currentAverage).plus(purchaseQuantity.times(purchasePrice));
  const totalQuantity = currentQuantity.plus(purchaseQuantity);
  if (totalQuantity.lte(0)) {
    return new Big(0);
  }
  return totalCost.div(totalQuantity);
}
