import { NextResponse } from "next/server";
import { fetchB3Snapshot } from "@/lib/investments/b3Snapshot";

export const runtime = "nodejs";

type RequestBody = {
  assets?: Array<{
    symbol?: string;
    name?: string | null;
  }>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const assets = Array.isArray(body.assets) ? body.assets : [];

    if (!assets.length) {
      return NextResponse.json({ snapshots: {} });
    }

    const snapshots = await Promise.all(
      assets.map(async (asset) => {
        const symbol = String(asset?.symbol ?? "").trim().toUpperCase();
        if (!symbol) return null;
        const snapshot = await fetchB3Snapshot(symbol, asset?.name ?? null);
        return snapshot ? [symbol, snapshot] : [symbol, null];
      }),
    );

    return NextResponse.json({
      snapshots: Object.fromEntries(snapshots.filter(Boolean) as Array<[string, unknown]>),
    });
  } catch {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400 },
    );
  }
}
