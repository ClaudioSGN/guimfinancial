import { NextRequest, NextResponse } from "next/server";
import {
  fetchCryptoSimplePrices,
  type Quote,
} from "@/lib/investments/marketDataServer";
import {
  normalizeInvestmentCurrency,
  type SupportedInvestmentCurrency,
} from "../../../../../shared/investmentCurrency";

export async function GET(request: NextRequest) {
  const idsParam = request.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((item) => item.trim()).filter(Boolean);
  const currency = normalizeInvestmentCurrency(
    request.nextUrl.searchParams.get("currency"),
    "crypto",
  ) as SupportedInvestmentCurrency;

  if (!ids.length) {
    return NextResponse.json({ quotes: {} satisfies Record<string, Quote> });
  }

  const quotes = await fetchCryptoSimplePrices(ids, currency);
  return NextResponse.json({ quotes });
}
