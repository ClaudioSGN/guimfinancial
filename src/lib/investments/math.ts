import Big from "big.js";

export type PurchaseMode = "quantity" | "value";

type BigValue = ReturnType<typeof Big>;

export type QuantityResult = {
  quantity: BigValue;
  total: BigValue;
};

export function computeTotal(quantity: BigValue, pricePerShare: BigValue) {
  return quantity.times(pricePerShare);
}

export function computeQuantityFromValue(
  investedValue: BigValue,
  pricePerShare: BigValue,
  decimals: number,
) {
  if (pricePerShare.lte(0)) {
    return { quantity: new Big(0), total: new Big(0) };
  }
  const rawQuantity = investedValue.div(pricePerShare);
  const quantity = rawQuantity.round(decimals, Big.roundDown);
  const total = computeTotal(quantity, pricePerShare);
  return { quantity, total };
}

export function computeNewAveragePrice(
  currentQuantity: BigValue,
  currentAveragePrice: BigValue,
  purchaseQuantity: BigValue,
  purchasePrice: BigValue,
) {
  if (purchaseQuantity.lte(0)) {
    return currentAveragePrice;
  }
  if (currentQuantity.lte(0)) {
    return purchasePrice;
  }
  const totalCost = currentQuantity.times(currentAveragePrice).plus(
    purchaseQuantity.times(purchasePrice),
  );
  const totalQuantity = currentQuantity.plus(purchaseQuantity);
  return totalCost.div(totalQuantity);
}
