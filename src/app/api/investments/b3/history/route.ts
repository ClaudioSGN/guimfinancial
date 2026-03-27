import { NextRequest, NextResponse } from "next/server";
import { fetchB3History } from "@/lib/investments/marketDataServer";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ history: [], error: "Missing symbol." }, { status: 400 });
  }

  const history = await fetchB3History(symbol);
  return NextResponse.json({ history });
}
