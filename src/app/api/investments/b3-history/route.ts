import { NextResponse } from "next/server";
import { fetchB3History } from "@/lib/investments/b3Snapshot";

export const runtime = "nodejs";

type RequestBody = {
  symbol?: string;
  name?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const symbol = String(body.symbol ?? "").trim().toUpperCase();

    if (!symbol) {
      return NextResponse.json({ history: [] });
    }

    const history = await fetchB3History(symbol, body.name ?? null);
    return NextResponse.json({ history });
  } catch {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400 },
    );
  }
}
