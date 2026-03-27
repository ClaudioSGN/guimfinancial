import { NextRequest, NextResponse } from "next/server";
import { fetchCryptoMarketSnapshot } from "@/lib/investments/marketDataServer";
import { normalizeInvestmentCurrency } from "../../../../../shared/investmentCurrency";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ snapshot: null, error: "Missing id." }, { status: 400 });
  }

  const currency = normalizeInvestmentCurrency(
    request.nextUrl.searchParams.get("currency"),
    "crypto",
  );
  const snapshot = await fetchCryptoMarketSnapshot(id, currency);
  return NextResponse.json({ snapshot });
}
