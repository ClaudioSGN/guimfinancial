import { NextRequest, NextResponse } from "next/server";
import { fetchFeaturedCryptoOptions } from "@/lib/investments/marketDataServer";
import { normalizeInvestmentCurrency } from "../../../../../shared/investmentCurrency";

export async function GET(request: NextRequest) {
  const idsParam = request.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((item) => item.trim()).filter(Boolean);
  const currency = normalizeInvestmentCurrency(
    request.nextUrl.searchParams.get("currency"),
    "crypto",
  );

  const options = await fetchFeaturedCryptoOptions(ids, currency);
  return NextResponse.json({ options });
}
