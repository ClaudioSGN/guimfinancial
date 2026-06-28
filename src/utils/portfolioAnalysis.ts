export type PortfolioAssetType =
  | "stock"
  | "fii"
  | "etf"
  | "fixed_income"
  | "crypto"
  | "international"
  | "other";

export type PortfolioAssetInput = {
  id: string;
  name: string;
  ticker: string;
  assetType: PortfolioAssetType;
  sector: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
};

export type PortfolioAssetAnalysis = PortfolioAssetInput & {
  investedValue: number;
  currentValue: number;
  result: number;
  resultPercentage: number;
  weight: number;
};

export type PortfolioAllocation = {
  key: string;
  label: string;
  value: number;
  weight: number;
};

export type PortfolioRiskClassification = "low" | "moderate" | "high" | "very_high" | "neutral";

export type PortfolioRiskAlertKind = "neutral" | "danger" | "warning" | "success";

export type PortfolioRiskAlert = {
  kind: PortfolioRiskAlertKind;
  message: string;
};

export type PortfolioRiskAnalysis = {
  score: number;
  classification: PortfolioRiskClassification;
  alerts: PortfolioRiskAlert[];
  assets: PortfolioAssetAnalysis[];
  totals: {
    invested: number;
    current: number;
    result: number;
    resultPercentage: number;
    assetCount: number;
  };
  allocationByType: PortfolioAllocation[];
  allocationBySector: PortfolioAllocation[];
  largestWeights: PortfolioAssetAnalysis[];
};

function safeNumber(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function buildAllocation<T extends string>(
  assets: PortfolioAssetAnalysis[],
  totalCurrentValue: number,
  getKey: (asset: PortfolioAssetAnalysis) => T,
  getLabel: (asset: PortfolioAssetAnalysis) => string,
) {
  const map = new Map<string, PortfolioAllocation>();

  assets.forEach((asset) => {
    const key = getKey(asset) || "other";
    const label = getLabel(asset) || key;
    const current = map.get(key) ?? { key, label, value: 0, weight: 0 };
    current.value += asset.currentValue;
    current.weight = totalCurrentValue > 0 ? (current.value / totalCurrentValue) * 100 : 0;
    map.set(key, current);
  });

  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

function getRiskClassification(score: number): PortfolioRiskClassification {
  if (score <= 0) return "neutral";
  if (score <= 30) return "low";
  if (score <= 60) return "moderate";
  if (score <= 80) return "high";
  return "very_high";
}

export function calculatePortfolioRisk(
  inputAssets: PortfolioAssetInput[],
): PortfolioRiskAnalysis {
  const preparedAssets = inputAssets.map((asset) => {
    const quantity = safeNumber(asset.quantity);
    const averagePrice = safeNumber(asset.averagePrice);
    const currentPrice = safeNumber(asset.currentPrice);
    const investedValue = quantity * averagePrice;
    const currentValue = quantity * currentPrice;
    const result = currentValue - investedValue;
    const resultPercentage = investedValue > 0 ? (result / investedValue) * 100 : 0;

    return {
      ...asset,
      quantity,
      averagePrice,
      currentPrice,
      investedValue,
      currentValue,
      result,
      resultPercentage,
      weight: 0,
    };
  });

  const totalInvested = preparedAssets.reduce((sum, asset) => sum + asset.investedValue, 0);
  const totalCurrent = preparedAssets.reduce((sum, asset) => sum + asset.currentValue, 0);
  const totalResult = totalCurrent - totalInvested;
  const totalResultPercentage = totalInvested > 0 ? (totalResult / totalInvested) * 100 : 0;

  const assets = preparedAssets
    .map((asset) => ({
      ...asset,
      weight: totalCurrent > 0 ? (asset.currentValue / totalCurrent) * 100 : 0,
    }))
    .sort((a, b) => b.currentValue - a.currentValue);

  const allocationByType = buildAllocation(
    assets,
    totalCurrent,
    (asset) => asset.assetType,
    (asset) => asset.assetType,
  );
  const allocationBySector = buildAllocation(
    assets,
    totalCurrent,
    (asset) => asset.sector || "Unclassified",
    (asset) => asset.sector || "Unclassified",
  );

  if (!assets.length || totalCurrent <= 0) {
    return {
      score: 0,
      classification: "neutral",
      alerts: [
        {
          kind: "neutral",
          message: "Your portfolio is still empty. Add assets to start the risk analysis.",
        },
      ],
      assets,
      totals: {
        invested: totalInvested,
        current: totalCurrent,
        result: totalResult,
        resultPercentage: totalResultPercentage,
        assetCount: assets.length,
      },
      allocationByType,
      allocationBySector,
      largestWeights: [],
    };
  }

  let score = 0;
  const alerts: PortfolioRiskAlert[] = [];
  const largestAssetWeight = assets[0]?.weight ?? 0;
  const largestTypeWeight = allocationByType[0]?.weight ?? 0;
  const largestSectorWeight = allocationBySector[0]?.weight ?? 0;

  if (largestAssetWeight > 40) {
    score += 35;
    alerts.push({
      kind: "danger",
      message: "Your portfolio is highly concentrated in a single asset.",
    });
  } else if (largestAssetWeight >= 25) {
    score += 20;
    alerts.push({
      kind: "warning",
      message: "One asset has a relevant weight in your portfolio.",
    });
  } else if (largestAssetWeight >= 15) {
    score += 10;
  }

  if (assets.length < 3) {
    score += 25;
    alerts.push({
      kind: "warning",
      message: "There are fewer than 3 assets in the portfolio.",
    });
  } else if (assets.length <= 5) {
    score += 15;
  } else {
    score += 5;
  }

  if (largestTypeWeight > 70) {
    score += 25;
    alerts.push({
      kind: "warning",
      message: "There is little diversification between asset types.",
    });
  } else if (largestTypeWeight >= 50) {
    score += 15;
  }

  if (largestSectorWeight > 50) {
    score += 15;
    alerts.push({
      kind: "warning",
      message: "One sector represents a large part of your portfolio.",
    });
  } else if (largestSectorWeight >= 30) {
    score += 10;
  }

  if (!alerts.length) {
    alerts.push({
      kind: "success",
      message: "Your portfolio is well distributed.",
    });
  }

  const finalScore = Math.min(100, Math.round(score));

  return {
    score: finalScore,
    classification: getRiskClassification(finalScore),
    alerts,
    assets,
    totals: {
      invested: totalInvested,
      current: totalCurrent,
      result: totalResult,
      resultPercentage: totalResultPercentage,
      assetCount: assets.length,
    },
    allocationByType,
    allocationBySector,
    largestWeights: assets.slice(0, 5),
  };
}
