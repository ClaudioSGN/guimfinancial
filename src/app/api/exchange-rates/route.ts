import { NextResponse } from "next/server";
import { parseDollarQuotes } from "@/lib/dollarPurchases";

export const runtime = "nodejs";

export async function GET() {
  try {
    const response = await fetch("https://api.frankfurter.dev/v2/rates?base=USD&quotes=BRL,EUR", {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Exchange-rate provider unavailable");
    const quotes = parseDollarQuotes(await response.json());
    return NextResponse.json({ quotes, source: "Frankfurter", base: "USD" });
  } catch {
    return NextResponse.json({ error: "exchange_rates_unavailable" }, { status: 503 });
  }
}
