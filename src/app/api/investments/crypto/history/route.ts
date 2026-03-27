import { NextRequest, NextResponse } from "next/server";
import { fetchCryptoHistory } from "@/lib/investments/marketDataServer";
import { normalizeInvestmentCurrency } from "../../../../../shared/investmentCurrency";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ history: [], error: "Missing symbol." }, { status: 400 });
  }

  const currency = normalizeInvestmentCurrency(
    request.nextUrl.searchParams.get("currency"),
    "crypto",
  );
  const history = await fetchCryptoHistory(symbol, currency);
  return NextResponse.json({ history });
}
