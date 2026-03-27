import { NextRequest, NextResponse } from "next/server";
import { fetchSingleB3Quote, normalizeB3Symbol } from "@/lib/investments/marketDataServer";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  const includeFundamentalsFallback =
    request.nextUrl.searchParams.get("includeFundamentalsFallback") !== "0";

  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol." }, { status: 400 });
  }

  const quote = await fetchSingleB3Quote(normalizeB3Symbol(symbol), {
    includeFundamentalsFallback,
  });
  return NextResponse.json({ quote });
}
